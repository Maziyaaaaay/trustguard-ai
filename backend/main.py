from face_detector import detect_faces

import asyncio
import logging

from typing import List, Optional, Dict, Any

from io import BytesIO

from datetime import datetime

import os

import re

import json

import hashlib

import statistics
import math
import wave
import struct
import subprocess
import tempfile
import shutil
from pathlib import Path



import cv2

import pymupdf as fitz

import numpy as np

import pytesseract



from PIL import Image, ImageChops, ImageStat, ExifTags



from fastapi import (

    FastAPI,

    File,
    HTTPException,

    UploadFile,

    WebSocket,

    WebSocketDisconnect,

)

from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool





# ============================================================

# TRUSTGUARD AI - BACKEND

# ============================================================



app = FastAPI(

    title="TrustGuard AI",

    description="Multimodal AI Fraud Detection & Prevention API",

    version="0.2.0",

)

logger = logging.getLogger("trustguard.api")





# ============================================================

# CORS

# ============================================================



app.add_middleware(

    CORSMiddleware,

    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "TRUSTGUARD_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ],

    allow_credentials=False,

    allow_methods=["GET", "POST"],

    allow_headers=["Content-Type"],

)





# ============================================================

# TESSERACT CONFIGURATION

# ============================================================



LOCAL_TESSERACT_PATH = (
    Path(__file__).resolve().parent.parent
    / ".tools"
    / "tesseract"
    / "bin"
    / "tesseract"
)
TESSERACT_PATH = (
    os.getenv("TESSERACT_CMD")
    or shutil.which("tesseract")
    or (
        str(LOCAL_TESSERACT_PATH)
        if LOCAL_TESSERACT_PATH.is_file()
        else r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    )
)
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_MEDIA_DURATION_SECONDS = 180
MAX_VIDEO_DIMENSION = 4096
MAX_CONCURRENT_ANALYSES = 2
analysis_slots = asyncio.Semaphore(MAX_CONCURRENT_ANALYSES)
Image.MAX_IMAGE_PIXELS = 25_000_000
VIDEO_FACE_CLASSIFIER = cv2.CascadeClassifier(
    os.path.join(
        cv2.data.haarcascades,
        "haarcascade_frontalface_default.xml",
    )
)



if os.path.exists(TESSERACT_PATH):

    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH


async def read_upload_limited(file: UploadFile) -> bytes:
    """Read an upload with a strict per-file size cap."""
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is too large. Maximum upload size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )
    return content





# ============================================================

# DATA MODELS

# ============================================================



class RiskInput(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    voice_risk: float = Field(default=0, ge=0, le=100)

    document_risk: float = Field(default=0, ge=0, le=100)

    identity_risk: float = Field(default=0, ge=0, le=100)

    transaction_risk: float = Field(default=0, ge=0, le=100)

    graph_risk: float = Field(default=0, ge=0, le=100)





class RiskResponse(BaseModel):

    score: int

    level: str

    signals: List[str]

    recommendation: str





class TransactionInput(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    transaction_id: str = Field(min_length=1, max_length=128)

    amount: float = Field(ge=0, le=1_000_000_000)

    method: str = Field(min_length=1, max_length=32)

    sender: str = Field(min_length=1, max_length=128)

    receiver: str = Field(min_length=1, max_length=128)





class IdentityInput(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    name: str = Field(min_length=1, max_length=128)

    phone: Optional[str] = Field(default=None, max_length=32)

    email: Optional[str] = Field(default=None, max_length=254)

    account: Optional[str] = Field(default=None, max_length=128)

    document_verified: bool = False

    face_match_score: float = Field(default=0, ge=0, le=100)

    phone_verified: bool = False

    account_consistency: float = Field(default=0, ge=0, le=100)





# ============================================================

# GLOBAL SIMPLE CALL STORAGE

# ============================================================



call_connections: Dict[str, List[WebSocket]] = {}
call_connections_lock = asyncio.Lock()
MAX_SIGNALING_ROOMS = 100
MAX_SIGNALING_PEERS_PER_ROOM = 2
MAX_SIGNALING_MESSAGE_BYTES = 64 * 1024





# ============================================================

# HELPER FUNCTIONS

# ============================================================



def clamp_score(value: float) -> int:

    return max(0, min(100, int(round(value))))





def get_risk_level(score: int) -> str:

    # Prototype policy: 0–29 lower concern, 30–50 review, 51–100 high risk.
    if score > 50:

        return "HIGH"



    if score >= 30:

        return "MEDIUM"



    return "LOW"





def build_recommendation(level: str) -> str:

    if level == "HIGH":

        return (

            "High-risk warning: stop and verify through an independently known official channel before sharing information or taking action. This score is an indicator, not proof of fraud."

        )



    if level == "MEDIUM":

        return (

            "Review the original evidence and independently verify the person or request before proceeding. This score is not a final verdict."

        )



    return (

        "Lower concern based on the available heuristic signals. This does not certify safety; continue normal verification."

    )





def safe_percent(value: float) -> int:

    return clamp_score(value)





def normalize_text(text: str) -> str:

    text = text.upper()

    text = re.sub(r"[ \t]+", " ", text)

    text = re.sub(r"\n{2,}", "\n", text)

    return text.strip()





def text_contains_any(text: str, terms: List[str]) -> bool:

    upper = normalize_text(text)

    return any(term.upper() in upper for term in terms)





# ============================================================

# IMAGE HELPERS

# ============================================================



def pil_from_bytes(content: bytes) -> Image.Image:

    image = Image.open(BytesIO(content))

    image.load()

    return image.convert("RGB")





def cv_from_pil(image: Image.Image) -> np.ndarray:

    rgb = np.array(image)

    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)





def jpeg_ela_score(image: Image.Image) -> float:

    """

    Error Level Analysis approximation.



    This is a forensic indicator, not proof of image manipulation.

    """

    try:

        original = image.convert("RGB")



        temp = BytesIO()

        original.save(

            temp,

            format="JPEG",

            quality=90,

            optimize=True,

        )



        temp.seek(0)

        recompressed = Image.open(temp).convert("RGB")



        diff = ImageChops.difference(original, recompressed)

        stat = ImageStat.Stat(diff)



        mean_difference = sum(stat.mean) / len(stat.mean)



        # Normalize approximately to 0-100.

        score = min(100, mean_difference * 6.0)



        return clamp_score(score)



    except Exception:

        return 0





def image_quality_score(image: Image.Image) -> int:

    """

    Estimates basic image quality.



    Higher score = clearer image.

    """

    try:

        cv_image = cv_from_pil(image)



        gray = cv2.cvtColor(

            cv_image,

            cv2.COLOR_BGR2GRAY,

        )



        laplacian = cv2.Laplacian(

            gray,

            cv2.CV_64F,

        )



        variance = float(laplacian.var())



        # Reasonable practical normalization.

        quality = min(100, max(0, variance / 8))



        return clamp_score(quality)



    except Exception:

        return 0





def get_image_metadata(image: Image.Image) -> Dict[str, Any]:

    metadata: Dict[str, Any] = {}



    try:

        metadata["format"] = image.format

        metadata["mode"] = image.mode

        metadata["width"] = image.width

        metadata["height"] = image.height



        exif_data = image.getexif()



        readable_exif = {}



        for tag_id, value in exif_data.items():

            tag_name = ExifTags.TAGS.get(

                tag_id,

                str(tag_id),

            )



            if isinstance(value, bytes):

                try:

                    value = value.decode(

                        "utf-8",

                        errors="ignore",

                    )

                except Exception:

                    value = str(value)



            readable_exif[str(tag_name)] = str(value)



        metadata["exif"] = readable_exif



        software = (

            readable_exif.get("Software")

            or readable_exif.get("ProcessingSoftware")

            or ""

        )



        metadata["software"] = software



    except Exception as error:

        metadata["error"] = str(error)



    return metadata





# ============================================================

# FACE DETECTION

# ============================================================



def detect_faces(image: Image.Image) -> Dict[str, Any]:

    try:

        cv_image = cv_from_pil(image)

        gray = cv2.cvtColor(

            cv_image,

            cv2.COLOR_BGR2GRAY,

        )



        cascade_path = os.path.join(

            cv2.data.haarcascades,

            "haarcascade_frontalface_default.xml",

        )



        classifier = cv2.CascadeClassifier(cascade_path)



        faces = classifier.detectMultiScale(

            gray,

            scaleFactor=1.1,

            minNeighbors=5,

            minSize=(40, 40),

        )



        face_count = len(faces)



        boxes = []



        for x, y, w, h in faces:

            boxes.append(

                {

                    "x": int(x),

                    "y": int(y),

                    "width": int(w),

                    "height": int(h),

                }

            )



        return {

            "detected": face_count > 0,

            "count": face_count,

            "boxes": boxes,

        }



    except Exception as error:

        return {

            "detected": False,

            "count": 0,

            "boxes": [],

            "error": str(error),

        }





# ============================================================

# OCR

# ============================================================



def perform_ocr(image: Image.Image) -> Dict[str, Any]:

    """

    OCR using local Tesseract.



    Returns text and average confidence.

    """

    try:

        gray = cv2.cvtColor(

            cv_from_pil(image),

            cv2.COLOR_BGR2GRAY,

        )

        height, width = gray.shape[:2]
        scale = min(1.0, 2400 / max(height, width, 1))
        if scale < 1.0:
            gray = cv2.resize(
                gray,
                (max(1, int(width * scale)), max(1, int(height * scale))),
                interpolation=cv2.INTER_AREA,
            )



        # Mild preprocessing improves OCR on ID images.

        gray = cv2.resize(

            gray,

            None,

            fx=1.5,

            fy=1.5,

            interpolation=cv2.INTER_CUBIC,

        )



        gray = cv2.GaussianBlur(

            gray,

            (3, 3),

            0,

        )



        threshold = cv2.adaptiveThreshold(

            gray,

            255,

            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,

            cv2.THRESH_BINARY,

            31,

            11,

        )



        processed_image = Image.fromarray(threshold)



        data = pytesseract.image_to_data(

            processed_image,

            output_type=pytesseract.Output.DICT,

            config="--oem 3 --psm 6",

            timeout=20,

        )



        words = []

        confidences = []



        for index, raw_text in enumerate(data["text"]):

            word = raw_text.strip()



            if not word:

                continue



            try:

                confidence = float(

                    data["conf"][index]

                )

            except Exception:

                confidence = -1



            if confidence >= 0:

                confidences.append(confidence)



            words.append(word)



        text = " ".join(words).strip()



        average_confidence = (

            statistics.mean(confidences)

            if confidences

            else 0

        )



        return {

            "text": text,

            "confidence": clamp_score(average_confidence),

            "word_count": len(words),

        }



    except Exception as error:

        return {

            "text": "",

            "confidence": 0,

            "word_count": 0,

            "error": str(error),

        }





# ============================================================

# DOCUMENT TYPE CLASSIFICATION

# ============================================================



def classify_document(

    filename: str,

    text: str,

) -> Dict[str, Any]:



    upper_text = normalize_text(text)

    upper_filename = normalize_text(filename)



    checks = {

        "AADHAAR": [

            "AADHAAR",

            "UIDAI",

            "UNIQUE IDENTIFICATION",

        ],

        "PAN": [

            "INCOME TAX",

            "PERMANENT ACCOUNT NUMBER",

            "PAN",

        ],

        "PASSPORT": [

            "PASSPORT",

            "REPUBLIC OF INDIA",

            "P<IND",

        ],

        "DRIVING LICENSE": [

            "DRIVING LICENCE",

            "DRIVING LICENSE",

            "DL NO",

            "TRANSPORT",

        ],

        "VOTER ID": [

            "ELECTION COMMISSION",

            "ELECTOR PHOTO IDENTITY",

            "EPIC",

            "VOTER",

        ],

    }



    scores = {}



    for document_type, keywords in checks.items():

        score = 0



        for keyword in keywords:

            if keyword in upper_text:

                score += 1



            if keyword in upper_filename:

                score += 1



        scores[document_type] = score



    if not scores or max(scores.values()) == 0:

        return {

            "type": "UNKNOWN ID DOCUMENT",

            "confidence": 20,

            "keyword_scores": scores,

        }



    detected_type = max(

        scores,

        key=scores.get,

    )



    max_score = scores[detected_type]



    confidence = min(

        98,

        45 + max_score * 15,

    )



    return {

        "type": detected_type,

        "confidence": confidence,

        "keyword_scores": scores,

    }





# ============================================================

# FIELD EXTRACTION

# ============================================================



def extract_fields(text: str) -> Dict[str, Any]:

    upper_text = normalize_text(text)



    fields: Dict[str, Any] = {

        "name": None,

        "date_of_birth": None,

        "gender": None,

        "phone": None,

        "email": None,

        "id_number": None,

        "address": None,

    }



    # ----------------------------

    # Date of birth

    # ----------------------------



    dob_patterns = [

        r"\b\d{2}[/-]\d{2}[/-]\d{4}\b",

        r"\b\d{4}[/-]\d{2}[/-]\d{2}\b",

    ]



    for pattern in dob_patterns:

        match = re.search(

            pattern,

            upper_text,

        )



        if match:

            fields["date_of_birth"] = match.group(0)

            break



    # ----------------------------

    # Phone

    # ----------------------------



    phone_matches = re.findall(

        r"\b[6-9]\d{9}\b",

        upper_text,

    )



    if phone_matches:

        fields["phone"] = phone_matches[0]



    # ----------------------------

    # Email

    # ----------------------------



    email_match = re.search(

        r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}",

        upper_text,

        re.IGNORECASE,

    )



    if email_match:

        fields["email"] = email_match.group(0)



    # ----------------------------

    # PAN

    # ----------------------------



    pan_match = re.search(

        r"\b[A-Z]{5}[0-9]{4}[A-Z]\b",

        upper_text,

    )



    # ----------------------------

    # Aadhaar

    # ----------------------------



    aadhaar_match = re.search(

        r"\b\d{4}\s?\d{4}\s?\d{4}\b",

        upper_text,

    )



    # ----------------------------

    # Passport

    # ----------------------------



    passport_match = re.search(

        r"\b[A-Z][0-9]{7}\b",

        upper_text,

    )



    # ----------------------------

    # Generic licence-like number

    # ----------------------------



    licence_match = re.search(

        r"\b[A-Z]{2}[- ]?[0-9]{2}[- ]?[0-9]{4,14}\b",

        upper_text,

    )



    if pan_match:

        fields["id_number"] = pan_match.group(0)



    elif aadhaar_match:

        fields["id_number"] = aadhaar_match.group(0)



    elif passport_match:

        fields["id_number"] = passport_match.group(0)



    elif licence_match:

        fields["id_number"] = licence_match.group(0)



    # ----------------------------

    # Gender

    # ----------------------------



    if re.search(r"\bMALE\b", upper_text):

        fields["gender"] = "MALE"



    elif re.search(r"\bFEMALE\b", upper_text):

        fields["gender"] = "FEMALE"



    # ----------------------------

    # Name

    # ----------------------------



    name_patterns = [

        r"(?:NAME|SURNAME)\s*[:*-]\s*([A-Z][A-Z .]{2,50})",

        r"(?:NAME OF HOLDER)\s*[:*-]\s*([A-Z][A-Z .]{2,50})",

    ]



    for pattern in name_patterns:

        name_match = re.search(

            pattern,

            upper_text,

        )



        if name_match:

            fields["name"] = name_match.group(1).strip()

            break



    return fields





# ============================================================

# TEXT / FIELD CONSISTENCY

# ============================================================



def evaluate_document_structure(

    text: str,

    document_type: str,

    fields: Dict[str, Any],

) -> Dict[str, Any]:



    normalized = normalize_text(text)



    required_checks = []



    if document_type == "PAN":

        required_checks = [

            "INCOME",

            "PERMANENT",

            "ACCOUNT",

        ]



    elif document_type == "AADHAAR":

        required_checks = [

            "AADHAAR",

            "IDENTIFICATION",

        ]



    elif document_type == "PASSPORT":

        required_checks = [

            "PASSPORT",

            "REPUBLIC",

        ]



    elif document_type == "DRIVING LICENSE":

        required_checks = [

            "DRIVING",

        ]



    elif document_type == "VOTER ID":

        required_checks = [

            "ELECTION",

        ]



    else:

        required_checks = [

            "NAME",

        ]



    matched = 0



    for item in required_checks:

        if item in normalized:

            matched += 1



    structure_score = (

        matched / len(required_checks) * 100

        if required_checks

        else 50

    )



    field_values = [

        value

        for value in fields.values()

        if value

    ]



    required_field_score = min(

        100,

        len(field_values) * 18,

    )



    return {

        "structure_score": clamp_score(structure_score),

        "required_fields_score": clamp_score(

            required_field_score

        ),

        "required_terms": required_checks,

        "matched_terms": matched,

    }





# ============================================================

# METADATA ANALYSIS

# ============================================================



def analyze_metadata(

    metadata: Dict[str, Any],

    filename: str,

    is_pdf: bool,

) -> Dict[str, Any]:



    suspicious_reasons: List[str] = []



    software = str(

        metadata.get("software", "")

    ).upper()



    # Common editing software strings.

    editing_tools = [

        "PHOTOSHOP",

        "ADOBE",

        "GIMP",

        "CANVA",

        "PIXLR",

        "CORELDRAW",

    ]



    for tool in editing_tools:

        if tool in software:

            suspicious_reasons.append(

                f"Editing software metadata detected: {tool}"

            )



    if is_pdf:

        pdf_creator = str(

            metadata.get("creator", "")

        ).upper()



        pdf_producer = str(

            metadata.get("producer", "")

        ).upper()



        combined = f"{pdf_creator} {pdf_producer}"



        for tool in editing_tools:

            if tool in combined:

                suspicious_reasons.append(

                    f"PDF metadata references editing software: {tool}"

                )



    metadata_risk = min(

        100,

        len(suspicious_reasons) * 35,

    )



    return {

        "risk": clamp_score(metadata_risk),

        "suspicious": len(suspicious_reasons) > 0,

        "reasons": suspicious_reasons,

        "raw": metadata,

    }





# ============================================================

# IMAGE FORENSICS

# ============================================================



def analyze_image_integrity(

    image: Image.Image,

) -> Dict[str, Any]:



    ela = jpeg_ela_score(image)

    quality = image_quality_score(image)



    cv_image = cv_from_pil(image)

    gray = cv2.cvtColor(

        cv_image,

        cv2.COLOR_BGR2GRAY,

    )



    # Edge density.

    edges = cv2.Canny(

        gray,

        100,

        200,

    )



    edge_density = (

        np.count_nonzero(edges)

        / edges.size

        * 100

    )



    # Very extreme ELA can be worth review.

    ela_risk = 0



    if ela >= 70:

        ela_risk = 80



    elif ela >= 45:

        ela_risk = 55



    elif ela >= 25:

        ela_risk = 30



    # Extremely low quality can indicate screenshot /

    # recompression, but is NOT inherently fraudulent.

    quality_risk = 0



    if quality < 20:

        quality_risk = 35



    elif quality < 35:

        quality_risk = 20



    forensic_risk = clamp_score(

        ela_risk * 0.65

        + quality_risk * 0.20

        + min(edge_density * 2, 15)

    )



    return {

        "ela_indicator": ela,

        "image_quality": quality,

        "edge_density": round(

            float(edge_density),

            2,

        ),

        "risk": forensic_risk,

    }





# ============================================================

# SYNTHETIC / AI INDICATOR

# ============================================================



def analyze_ai_indicators(

    text: str,

    metadata_result: Dict[str, Any],

    integrity_result: Dict[str, Any],

) -> Dict[str, Any]:



    indicators = []



    risk = 0



    software = str(

        metadata_result

        .get("raw", {})

        .get("software", "")

    ).upper()



    if any(

        tool in software

        for tool in [

            "PHOTOSHOP",

            "GIMP",

            "CANVA",

            "PIXLR",

        ]

    ):

        risk += 35

        indicators.append(

            "Image-editing software metadata detected."

        )



    ela_indicator = integrity_result.get(

        "ela_indicator",

        0,

    )



    if ela_indicator >= 45:

        risk += 30

        indicators.append(

            "Recompression/error-level pattern warrants review."

        )



    # OCR unusualness.

    text_length = len(

        normalize_text(text)

    )



    if text_length < 15:

        risk += 15

        indicators.append(

            "Very limited readable text was extracted."

        )



    # Repeated punctuation/noise can appear in bad OCR

    # or generated/manipulated images.

    special_ratio = 0



    if text:

        unusual = len(

            re.findall(

                r"[^A-Z0-9\s./:@-]",

                normalize_text(text),

            )

        )



        special_ratio = unusual / max(

            len(text),

            1,

        )



    if special_ratio > 0.08:

        risk += 10

        indicators.append(

            "OCR contains an unusually high amount of noisy characters."

        )



    risk = clamp_score(risk)



    if not indicators:

        indicators.append(

            "No strong synthetic-image indicator detected from available forensic checks."

        )



    return {

        "risk": risk,

        "level": get_risk_level(risk),

        "indicators": indicators,

        "method": (

            "Metadata, recompression, OCR-quality and image-forensic heuristics"

        ),

    }





# ============================================================

# PDF PROCESSING

# ============================================================



def render_pdf_first_page(

    content: bytes,

) -> Dict[str, Any]:



    document = fitz.open(

        stream=content,

        filetype="pdf",

    )



    if len(document) == 0:

        raise ValueError(

            "PDF contains no pages."

        )



    if len(document) > 1000:
        document.close()
        raise ValueError("PDF contains too many pages for prototype analysis.")

    page = document.load_page(0)



    page_rect = page.rect
    page_scale = min(
        2.0,
        2048 / max(page_rect.width, page_rect.height, 1),
    )
    matrix = fitz.Matrix(page_scale, page_scale)



    pixmap = page.get_pixmap(

        matrix=matrix,

        alpha=False,

    )



    image = Image.frombytes(

        "RGB",

        [pixmap.width, pixmap.height],

        pixmap.samples,

    )



    metadata = document.metadata or {}



    result = {

        "image": image,

        "metadata": metadata,

        "page_count": len(document),

        "pdf_text": page.get_text(),

    }



    document.close()



    return result





# ============================================================

# DOCUMENT ANALYSIS ENGINE

# ============================================================



def perform_document_analysis(

    content: bytes,

    filename: str,

    content_type: str,

) -> Dict[str, Any]:



    lower_filename = filename.lower()



    is_pdf = (

        content_type == "application/pdf"

        or lower_filename.endswith(".pdf")

    )



    # --------------------------------------------------------

    # Read / render

    # --------------------------------------------------------



    if is_pdf:

        pdf_result = render_pdf_first_page(

            content

        )



        image = pdf_result["image"]

        metadata = pdf_result["metadata"]



        base_text = pdf_result.get(

            "pdf_text",

            "",

        )



        page_count = pdf_result["page_count"]



    else:

        image = pil_from_bytes(content)



        metadata = get_image_metadata(

            image

        )



        base_text = ""



        page_count = 1



    # --------------------------------------------------------

    # OCR

    # --------------------------------------------------------



    ocr_result = perform_ocr(

        image

    )



    ocr_text = normalize_text(

        ocr_result.get("text", "")

    )



    # For PDFs, combine actual PDF text and OCR.

    if base_text.strip():

        combined_text = normalize_text(

            f"{base_text}\n{ocr_text}"

        )



        # Remove excessive duplicate text

        # while retaining extracted content.

        if len(base_text) > len(ocr_text):

            final_text = normalize_text(

                base_text

            )

        else:

            final_text = combined_text

    else:

        final_text = ocr_text



    # --------------------------------------------------------

    # Document type

    # --------------------------------------------------------



    document_type = classify_document(

        filename,

        final_text,

    )



    # --------------------------------------------------------

    # Fields

    # --------------------------------------------------------



    fields = extract_fields(

        final_text

    )



    # --------------------------------------------------------

    # Structure

    # --------------------------------------------------------



    structure = evaluate_document_structure(

        final_text,

        document_type["type"],

        fields,

    )



    # --------------------------------------------------------

    # Face detection

    # --------------------------------------------------------



    faces = detect_faces(

        image

    )



    # --------------------------------------------------------

    # Image integrity

    # --------------------------------------------------------



    integrity = analyze_image_integrity(

        image

    )



    # --------------------------------------------------------

    # Metadata

    # --------------------------------------------------------



    if is_pdf:

        metadata_result = analyze_metadata(

            {

                "creator": metadata.get(

                    "creator",

                    ""

                ),

                "producer": metadata.get(

                    "producer",

                    ""

                ),

                "format": "PDF",

                "pages": page_count,

            },

            filename,

            True,

        )



    else:

        metadata_result = analyze_metadata(

            metadata,

            filename,

            False,

        )



    # --------------------------------------------------------

    # AI indicators

    # --------------------------------------------------------



    ai_indicators = analyze_ai_indicators(

        final_text,

        metadata_result,

        integrity,

    )



    # ========================================================

    # RISK CALCULATION

    # ========================================================



    # OCR confidence is treated as a weak signal.

    ocr_risk = 100 - ocr_result.get(

        "confidence",

        0,

    )



    # Document-type uncertainty.

    type_risk = 100 - document_type.get(

        "confidence",

        0,

    )



    # Structure risk.

    structure_risk = 100 - structure.get(

        "structure_score",

        0,

    )



    # Required-field risk.

    field_risk = 100 - structure.get(

        "required_fields_score",

        0,

    )



    # Face signal.

    if faces.get("detected"):

        face_risk = 10

    else:

        face_risk = 75



    # A multi-face ID document gets additional scrutiny.

    if faces.get("count", 0) > 1:

        face_risk += 15



    # Integrality / forensic risk.

    integrity_risk = integrity.get(

        "risk",

        0,

    )



    metadata_risk = metadata_result.get(

        "risk",

        0,

    )



    ai_risk = ai_indicators.get(

        "risk",

        0,

    )



    # Weighted explainable fusion.

    score = (

        ocr_risk * 0.10

        + type_risk * 0.10

        + structure_risk * 0.15

        + field_risk * 0.10

        + face_risk * 0.15

        + integrity_risk * 0.18

        + metadata_risk * 0.07

        + ai_risk * 0.15

    )



    # Additional high-risk triggers.

    if document_type["type"] == "UNKNOWN ID DOCUMENT":

        score += 8



    if not fields.get("id_number"):

        score += 5



    if metadata_result.get("suspicious"):

        score += 7



    final_score = clamp_score(

        score

    )



    level = get_risk_level(

        final_score

    )



    # ========================================================

    # COMPATIBILITY SIGNALS

    # ========================================================



    document_integrity = clamp_score(

        100 - integrity_risk

    )



    face_document_match = (

        90

        if faces.get("detected")

        else 25

    )



    if faces.get("count", 0) > 1:

        face_document_match = 55



    identity_consistency = clamp_score(

        (

            document_type.get(

                "confidence",

                0,

            )

            + structure.get(

                "structure_score",

                0,

            )

            + structure.get(

                "required_fields_score",

                0,

            )

        )

        / 3

    )



    required_fields = structure.get(

        "required_fields_score",

        0,

    )



    # ========================================================

    # FINDINGS

    # ========================================================



    findings: List[str] = []



    if document_type["type"] != "UNKNOWN ID DOCUMENT":

        findings.append(

            f"Document classified as {document_type['type']}."

        )

    else:

        findings.append(

            "Document type could not be confidently classified."

        )



    if ocr_result.get("confidence", 0) >= 75:

        findings.append(

            "OCR produced high-confidence readable text."

        )

    elif ocr_result.get("confidence", 0) >= 45:

        findings.append(

            "OCR text is partially readable and should be reviewed."

        )

    else:

        findings.append(

            "OCR confidence is low."

        )



    if faces.get("detected"):

        findings.append(

            f"{faces.get('count')} face(s) detected in the document image."

        )

    else:

        findings.append(

            "No face detected in the document image."

        )



    if metadata_result.get("suspicious"):

        findings.extend(

            metadata_result.get(

                "reasons",

                [],

            )

        )

    else:

        findings.append(

            "No suspicious editing-software metadata detected."

        )



    if integrity.get("ela_indicator", 0) >= 45:

        findings.append(

            "Image recompression pattern warrants manual forensic review."

        )

    else:

        findings.append(

            "No strong recompression anomaly detected."

        )



    if ai_risk >= 45:

        findings.append(

            "Several synthetic/manipulation indicators require review."

        )

    else:

        findings.append(

            "No strong synthetic-media indicator was found by the available heuristics."

        )



    if not fields.get("id_number"):

        findings.append(

            "No recognizable identity-number pattern was extracted."

        )



    # ========================================================

    # RECOMMENDATION

    # ========================================================



    recommendation = build_recommendation(

        level

    )



    # More specific document action.

    if level == "HIGH":

        recommendation = (

            "Do not rely on this document for financial/KYC approval. "

            "Require manual verification against an authoritative source."

        )

    elif level == "MEDIUM":

        recommendation = (

            "Require secondary verification and manual document review "

            "before accepting the identity evidence."

        )

    else:

        recommendation = (

            "Document signals appear relatively consistent. "

            "Continue with normal verification controls."

        )



    # ========================================================

    # HASH

    # ========================================================



    sha256_hash = hashlib.sha256(

        content

    ).hexdigest()



    # ========================================================

    # FINAL RESPONSE

    # ========================================================



    return {

        "success": True,

        "module": "document_analysis",



        "file": {

            "name": filename,

            "type": content_type,

            "size_bytes": len(content),

            "sha256": sha256_hash,

            "pages": page_count,

        },



        "document": {

            "type": document_type["type"],

            "classification_confidence": document_type[

                "confidence"

            ],

            "keyword_scores": document_type[

                "keyword_scores"

            ],

        },



        "ocr": {

            "confidence": ocr_result.get(

                "confidence",

                0,

            ),

            "word_count": ocr_result.get(

                "word_count",

                0,

            ),

            "text": final_text[:10000],

        },



        "fields": fields,



        "face": {

            "detected": faces.get(

                "detected",

                False,

            ),

            "count": faces.get(

                "count",

                0,

            ),

            "boxes": faces.get(

                "boxes",

                [],

            ),

        },



        "metadata": metadata_result,



        "forensics": {

            "image_quality": integrity.get(

                "image_quality",

                0,

            ),

            "ela_indicator": integrity.get(

                "ela_indicator",

                0,

            ),

            "edge_density": integrity.get(

                "edge_density",

                0,

            ),

            "manipulation_risk": integrity.get(

                "risk",

                0,

            ),

        },



        "ai_indicators": ai_indicators,



        "risk": {

            "score": final_score,

            "level": level,

        },



        # These maintain compatibility with

        # the current KYC UI.

        "signals": {

            "document_integrity": document_integrity,

            "face_document_match": face_document_match,

            "identity_consistency": identity_consistency,

            "required_fields": required_fields,

            "ocr_confidence": ocr_result.get(

                "confidence",

                0,

            ),

            "metadata_risk": metadata_risk,

            "image_manipulation": integrity_risk,

            "ai_synthetic_indicator": ai_risk,

        },



        "findings": findings,



        "recommendation": recommendation,



        "analysis_note": (

            "Forensic indicators are heuristic signals and should "

            "not be treated as definitive proof of document fraud."

        ),



        "analyzed_at": datetime.utcnow().isoformat() + "Z",

    }





# ============================================================

# ROOT

# ============================================================



@app.get("/")

def root():

    return {

        "service": "TrustGuard AI",

        "status": "online",

        "version": "0.2.0",

    }





# ============================================================

# HEALTH

# ============================================================



@app.get("/health")

def health():

    return {

        "status": "healthy",

        "service": "TrustGuard AI Backend",

        "ocr": os.path.exists(

            TESSERACT_PATH

        ),

        "opencv": cv2.__version__,

        "pdf_engine": fitz.version[0],

    }





# ============================================================

# MEDIA ANALYSIS

# ============================================================



# ============================================================
# MEDIA FORENSICS ENGINE
# ============================================================

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac"}


def media_file_kind(filename: str, content_type: str) -> str:
    """Detect uploaded media type from MIME type and extension."""
    name = (filename or "").lower()
    mime = (content_type or "").lower()

    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"
    if mime.startswith("image/"):
        return "image"

    extension = Path(name).suffix.lower()
    if extension in VIDEO_EXTENSIONS:
        return "video"
    if extension in AUDIO_EXTENSIONS:
        return "audio"
    if extension in {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff", ".tif"}:
        return "image"

    return "unknown"


def _gray_frame(frame: np.ndarray) -> np.ndarray:
    if len(frame.shape) == 2:
        return frame
    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def _detect_video_faces(frame: np.ndarray) -> List[tuple]:
    """Robust Haar-based face detection for sampled video frames."""
    gray = _gray_frame(frame)
    gray = cv2.equalizeHist(gray)

    if VIDEO_FACE_CLASSIFIER.empty():
        return []

    faces = VIDEO_FACE_CLASSIFIER.detectMultiScale(
        gray,
        scaleFactor=1.08,
        minNeighbors=4,
        minSize=(36, 36),
        flags=cv2.CASCADE_SCALE_IMAGE,
    )

    return list(faces)


def _frame_difference(a: np.ndarray, b: np.ndarray) -> float:
    """Mean normalized frame difference, 0-100."""
    try:
        ga = cv2.resize(_gray_frame(a), (160, 90))
        gb = cv2.resize(_gray_frame(b), (160, 90))
        diff = cv2.absdiff(ga, gb)
        return float(np.mean(diff) / 255.0 * 100.0)
    except Exception:
        return 0.0


def _duplicate_frame_ratio(frames: List[np.ndarray]) -> float:
    if len(frames) < 2:
        return 0.0

    duplicate_count = 0
    comparisons = 0
    for previous, current in zip(frames, frames[1:]):
        comparisons += 1
        if _frame_difference(previous, current) < 0.45:
            duplicate_count += 1

    return duplicate_count / max(comparisons, 1) * 100.0


def _face_temporal_metrics(face_records: List[List[tuple]]) -> Dict[str, float]:
    present = [records for records in face_records if records]
    presence = len(present) / max(len(face_records), 1) * 100.0

    centers = []
    areas = []
    counts = []

    for records in face_records:
        counts.append(len(records))
        if records:
            x, y, w, h = max(records, key=lambda box: box[2] * box[3])
            centers.append((x + w / 2.0, y + h / 2.0))
            areas.append(float(w * h))

    count_change = 0.0
    if len(counts) > 1:
        changes = sum(1 for a, b in zip(counts, counts[1:]) if a != b)
        count_change = changes / (len(counts) - 1) * 100.0

    area_cv = 0.0
    if len(areas) >= 3 and np.mean(areas) > 0:
        area_cv = float(np.std(areas) / np.mean(areas) * 100.0)

    center_motion = 0.0
    if len(centers) >= 2:
        distances = []
        for a, b in zip(centers, centers[1:]):
            distances.append(math.hypot(a[0] - b[0], a[1] - b[1]))
        center_motion = float(np.mean(distances)) if distances else 0.0

    return {
        "face_presence": round(presence, 1),
        "average_faces": round(float(np.mean(counts)), 2) if counts else 0.0,
        "face_count_change": round(count_change, 1),
        "face_area_variation": round(area_cv, 1),
        "face_center_motion": round(center_motion, 2),
    }


def _video_audio_to_wav(content: bytes, extension: str) -> Optional[str]:
    """Extract audio to a temporary WAV using FFmpeg when available."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None

    source_path = None
    wav_path = None
    try:
        source = tempfile.NamedTemporaryFile(
            suffix=extension or ".media",
            delete=False,
        )
        source.write(content)
        source.close()
        source_path = source.name

        wav_file = tempfile.NamedTemporaryFile(
            suffix=".wav",
            delete=False,
        )
        wav_file.close()
        wav_path = wav_file.name

        command = [
            ffmpeg,
            "-y",
            "-i",
            source_path,
            "-t",
            str(MAX_MEDIA_DURATION_SECONDS),
            "-vn",
            "-ac",
            "1",
            "-threads",
            "1",
            "-ar",
            "16000",
            "-f",
            "wav",
            wav_path,
        ]

        completed = subprocess.run(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=45,
        )

        if completed.returncode != 0 or not os.path.exists(wav_path):
            if wav_path:
                try:
                    os.remove(wav_path)
                except OSError:
                    pass
            return None

        return wav_path
    except Exception:
        if wav_path:
            try:
                os.remove(wav_path)
            except OSError:
                pass
        return None
    finally:
        if source_path:
            try:
                os.remove(source_path)
            except OSError:
                pass


def analyze_wav_audio(wav_path: str) -> Dict[str, Any]:
    """Analyze basic acoustic signals. These are heuristic, not a deepfake model."""
    try:
        with wave.open(wav_path, "rb") as wav:
            channels = wav.getnchannels()
            sample_rate = wav.getframerate()
            sample_width = wav.getsampwidth()
            frame_count = wav.getnframes()
            duration = frame_count / max(sample_rate, 1)
            if (
                duration > MAX_MEDIA_DURATION_SECONDS
                or sample_rate < 8_000
                or sample_rate > 96_000
                or channels < 1
                or channels > 2
            ):
                return {
                    "success": False,
                    "error": "Audio exceeds the supported duration or format limits.",
                }
            raw = wav.readframes(frame_count)

        if not raw or sample_width not in (1, 2, 4):
            return {"success": False, "error": "Unsupported WAV sample format."}

        dtype = {1: np.uint8, 2: np.int16, 4: np.int32}[sample_width]
        samples = np.frombuffer(raw, dtype=dtype).astype(np.float32)

        if channels > 1:
            samples = samples.reshape(-1, channels).mean(axis=1)

        if sample_width == 1:
            samples = samples - 128.0
            max_abs = 128.0
        elif sample_width == 2:
            max_abs = 32768.0
        else:
            max_abs = 2147483648.0

        normalized = np.clip(samples / max_abs, -1.0, 1.0)
        rms = float(np.sqrt(np.mean(np.square(normalized))))
        rms_db = 20.0 * math.log10(max(rms, 1e-8))

        if len(normalized) > 1:
            zcr = float(
                np.mean(np.signbit(normalized[:-1]) != np.signbit(normalized[1:]))
            )
        else:
            zcr = 0.0

        clipping = float(np.mean(np.abs(normalized) >= 0.995) * 100.0)
        silence = float(np.mean(np.abs(normalized) < 0.01) * 100.0)

        # Spectral flatness over a limited sample. Very artificial/noisy signals
        # can be flagged, but ordinary voices can also score here.
        spectrum_sample = normalized[: min(len(normalized), sample_rate * 8)]
        if len(spectrum_sample) >= 1024:
            window = np.hanning(len(spectrum_sample))
            spectrum = np.abs(np.fft.rfft(spectrum_sample * window)) + 1e-10
            geometric = math.exp(float(np.mean(np.log(spectrum))))
            arithmetic = float(np.mean(spectrum))
            spectral_flatness = geometric / max(arithmetic, 1e-10)
        else:
            spectral_flatness = 0.0

        # Heuristic acoustic anomaly score.
        synthetic_risk = 0.0
        acoustic_reasons = []

        if clipping > 3.0:
            synthetic_risk += 15
            acoustic_reasons.append("High audio clipping detected.")

        if silence > 92.0:
            synthetic_risk += 15
            acoustic_reasons.append("Audio contains an unusually high silence ratio.")

        if rms_db < -45.0:
            synthetic_risk += 10
            acoustic_reasons.append("Very low overall audio energy.")

        if spectral_flatness > 0.55:
            synthetic_risk += 20
            acoustic_reasons.append("Broadband spectral pattern warrants review.")

        if zcr > 0.35:
            synthetic_risk += 10
            acoustic_reasons.append("Unusually high zero-crossing activity.")

        synthetic_risk = clamp_score(synthetic_risk)

        return {
            "success": True,
            "duration_seconds": round(frame_count / max(sample_rate, 1), 2),
            "sample_rate": sample_rate,
            "channels": channels,
            "rms_db": round(rms_db, 2),
            "zero_crossing_rate": round(zcr, 4),
            "clipping_percent": round(clipping, 2),
            "silence_percent": round(silence, 2),
            "spectral_flatness": round(spectral_flatness, 4),
            "synthetic_voice": synthetic_risk,
            "reasons": acoustic_reasons,
            "method": "Acoustic heuristic signals; not a trained synthetic-voice classifier.",
        }
    except Exception as error:
        return {
            "success": False,
            "error": str(error),
        }


def analyze_audio_bytes(content: bytes, filename: str) -> Dict[str, Any]:
    """Analyze uploaded audio. WAV is native; other formats use FFmpeg."""
    extension = Path(filename).suffix.lower() or ".wav"
    wav_path = None
    try:
        if extension == ".wav":
            temp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            temp.write(content)
            temp.close()
            wav_path = temp.name
        else:
            wav_path = _video_audio_to_wav(content, extension)
            if not wav_path:
                return {
                    "success": False,
                    "error": "This audio format requires FFmpeg. Install FFmpeg or upload WAV.",
                }

        return analyze_wav_audio(wav_path)
    finally:
        if wav_path:
            try:
                os.remove(wav_path)
            except OSError:
                pass


def analyze_video_forensics(content: bytes, filename: str) -> Dict[str, Any]:
    """Sample a video and calculate explainable temporal/face/replay signals."""
    extension = Path(filename).suffix.lower() or ".mp4"
    source_path = None
    capture = None
    try:
        source = tempfile.NamedTemporaryFile(suffix=extension, delete=False)
        source.write(content)
        source.close()
        source_path = source.name

        capture = cv2.VideoCapture(source_path)
        if not capture.isOpened():
            return {
                "success": False,
                "error": "OpenCV could not decode this video. Try MP4/H.264 or install FFmpeg support.",
            }

        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        duration = frame_count / fps if fps > 0 and frame_count > 0 else 0.0

        if (
            width <= 0
            or height <= 0
            or width > MAX_VIDEO_DIMENSION
            or height > MAX_VIDEO_DIMENSION
            or width * height > 16_777_216
        ):
            capture.release()
            return {
                "success": False,
                "error": "Video dimensions exceed the supported analysis limit.",
            }

        if duration <= 0 or duration > MAX_MEDIA_DURATION_SECONDS:
            capture.release()
            return {
                "success": False,
                "error": "Video must have a readable duration under 3 minutes.",
            }

        target_samples = min(24, max(8, int(duration * 2) if duration > 0 else 12))
        if frame_count > 0:
            positions = np.linspace(
                0,
                max(frame_count - 1, 0),
                target_samples,
                dtype=int,
            )
        else:
            positions = np.arange(target_samples)

        frames: List[np.ndarray] = []
        face_records: List[List[tuple]] = []
        brightness_values: List[float] = []
        sharpness_values: List[float] = []

        for position in positions:
            if frame_count > 0:
                capture.set(cv2.CAP_PROP_POS_FRAMES, int(position))
            ok, frame = capture.read()
            if not ok or frame is None:
                continue

            # Bound per-frame memory and CPU for high-resolution uploads.
            frame_height, frame_width = frame.shape[:2]
            scale = min(1.0, 1280 / max(frame_width, 1), 720 / max(frame_height, 1))
            if scale < 1.0:
                frame = cv2.resize(
                    frame,
                    (int(frame_width * scale), int(frame_height * scale)),
                    interpolation=cv2.INTER_AREA,
                )

            frames.append(frame)
            faces = _detect_video_faces(frame)
            face_records.append(faces)

            gray = _gray_frame(frame)
            brightness_values.append(float(np.mean(gray)))
            sharpness_values.append(float(cv2.Laplacian(gray, cv2.CV_64F).var()))

        capture.release()

        if not frames:
            return {"success": False, "error": "No readable video frames were found."}

        temporal = _face_temporal_metrics(face_records)
        duplicate_ratio = _duplicate_frame_ratio(frames)

        motion_values = [
            _frame_difference(a, b)
            for a, b in zip(frames, frames[1:])
        ]
        average_motion = float(np.mean(motion_values)) if motion_values else 0.0

        # A very static stream with repeated frames is a replay/compositing signal.
        replay_risk = 0.0
        replay_reasons = []
        if duplicate_ratio > 18:
            replay_risk += 45
            replay_reasons.append("Repeated or near-identical frames detected.")
        elif duplicate_ratio > 8:
            replay_risk += 20
            replay_reasons.append("Some repeated frames were detected.")

        if average_motion < 0.35 and temporal["face_presence"] >= 50:
            replay_risk += 15
            replay_reasons.append("Very low temporal motion in a face-bearing video.")

        replay_risk = clamp_score(replay_risk)

        # Face temporal instability is a review signal. Camera movement can also cause it.
        face_manipulation = 0.0
        face_reasons = []
        if temporal["face_presence"] >= 30:
            if temporal["face_count_change"] > 35:
                face_manipulation += 30
                face_reasons.append("Face count changes substantially across sampled frames.")
            if temporal["face_area_variation"] > 28:
                face_manipulation += 25
                face_reasons.append("Face size changes unusually across sampled frames.")
            if temporal["face_center_motion"] > 55:
                face_manipulation += 15
                face_reasons.append("Large face-position changes were observed.")
        else:
            # No face is not automatically manipulation.
            face_reasons.append("No stable face was detected in enough sampled frames.")

        face_manipulation = clamp_score(face_manipulation)

        # Media integrity: duplicate frames + extreme brightness/quality variation.
        brightness_cv = 0.0
        if brightness_values and np.mean(brightness_values) > 0:
            brightness_cv = float(np.std(brightness_values) / np.mean(brightness_values) * 100)

        media_manipulation = clamp_score(
            duplicate_ratio * 1.2
            + min(brightness_cv * 0.8, 20)
            + (15 if fps <= 1 else 0)
        )

        # A conservative synthetic/AI indicator based only on available heuristics.
        ai_indicator = clamp_score(
            face_manipulation * 0.55
            + replay_risk * 0.25
            + media_manipulation * 0.20
        )

        audio_result = None
        synthetic_voice = 0
        audio_note = "No audio forensic analysis was available."
        if shutil.which("ffmpeg"):
            wav_path = _video_audio_to_wav(content, extension)
            if wav_path:
                try:
                    audio_result = analyze_wav_audio(wav_path)
                    if audio_result.get("success"):
                        synthetic_voice = int(audio_result.get("synthetic_voice", 0))
                        audio_note = "Audio track analyzed with acoustic heuristics."
                finally:
                    try:
                        os.remove(wav_path)
                    except OSError:
                        pass
        else:
            audio_note = "FFmpeg not installed; video audio was not analyzed."

        # If audio exists, include it without allowing a single weak acoustic signal to dominate.
        if audio_result and audio_result.get("success"):
            combined_score = clamp_score(
                synthetic_voice * 0.20
                + face_manipulation * 0.25
                + media_manipulation * 0.30
                + replay_risk * 0.25
            )
        else:
            combined_score = clamp_score(
                face_manipulation * 0.30
                + media_manipulation * 0.40
                + replay_risk * 0.30
            )

        findings = []
        if replay_reasons:
            findings.extend(replay_reasons)
        if face_reasons:
            findings.extend(face_reasons)
        if duplicate_ratio <= 8:
            findings.append("No strong repeated-frame anomaly detected.")
        if temporal["face_presence"] >= 70:
            findings.append("A face was consistently detected across sampled frames.")
        elif temporal["face_presence"] > 0:
            findings.append("Face detection was intermittent across sampled frames.")
        if audio_result and audio_result.get("success"):
            findings.extend(audio_result.get("reasons", []))
        else:
            findings.append(audio_note)

        return {
            "success": True,
            "kind": "video",
            "media_type": "VIDEO",
            "duration_seconds": round(duration, 2),
            "fps": round(fps, 2),
            "frame_count": frame_count,
            "sampled_frames": len(frames),
            "width": width,
            "height": height,
            "face_manipulation": face_manipulation,
            "media_manipulation": media_manipulation,
            "replay_risk": replay_risk,
            "synthetic_voice": synthetic_voice,
            "ai_synthetic_indicator": ai_indicator,
            "risk": combined_score,
            "face_metrics": temporal,
            "duplicate_frame_ratio": round(duplicate_ratio, 2),
            "average_frame_motion": round(average_motion, 2),
            "brightness_variation": round(brightness_cv, 2),
            "audio": audio_result,
            "findings": findings,
            "analysis_note": (
            "Video results are explainable frame and acoustic heuristics, not a trained deepfake detector or definitive proof of a deepfake."
            ),
            "method": "Sampled-frame, face/motion and optional acoustic heuristics.",
        }
    except Exception as error:
        return {
            "success": False,
            "error": str(error),
        }
    finally:
        if capture is not None:
            capture.release()
        if source_path:
            try:
                os.remove(source_path)
            except OSError:
                pass


def analyze_image_media(content: bytes, filename: str, content_type: str) -> Dict[str, Any]:
    """Reuse the existing image/document forensic helpers for standalone images."""
    try:
        image = pil_from_bytes(content)
        metadata = get_image_metadata(image)
        faces = detect_faces(image)
        integrity = analyze_image_integrity(image)
        ocr = perform_ocr(image)
        metadata_result = analyze_metadata(metadata, filename, False)
        ai_result = analyze_ai_indicators(ocr.get("text", ""), metadata_result, integrity)

        face_risk = 0 if faces.get("detected") else 10
        combined_score = clamp_score(
            integrity.get("risk", 0) * 0.45
            + ai_result.get("risk", 0) * 0.30
            + metadata_result.get("risk", 0) * 0.15
            + face_risk * 0.10
        )

        return {
            "success": True,
            "kind": "image",
            "media_type": "IMAGE",
            "risk": combined_score,
            "signals": {
                "synthetic_voice": 0,
                "face_manipulation": face_risk,
                "media_manipulation": integrity.get("risk", 0),
                "identity_consistency": 100 if faces.get("detected") else 0,
                "replay_risk": 0,
                "ai_synthetic_indicator": ai_result.get("risk", 0),
                "metadata_risk": metadata_result.get("risk", 0),
                "ocr_confidence": ocr.get("confidence", 0),
            },
            "face": faces,
            "ocr": ocr,
            "metadata": metadata_result,
            "forensics": integrity,
            "ai_indicators": ai_result,
            "findings": [
                "Image evidence analyzed without audio/voice signals.",
                f"Face detection: {'detected' if faces.get('detected') else 'not detected'}.",
                *ai_result.get("indicators", []),
            ],
            "analysis_note": (
                "Image authenticity values are heuristic indicators and should not be treated as definitive proof of manipulation."
            ),
        }
    except Exception as error:
        return {"success": False, "error": str(error)}


# ============================================================
# MEDIA ANALYSIS
# ============================================================

@app.post("/api/analyze/media")
async def analyze_media(file: UploadFile = File(...)):
    async with analysis_slots:
        try:
            return await _analyze_media(file)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Media analysis request failed")
            raise HTTPException(
                status_code=422,
                detail="The uploaded media could not be decoded or analyzed. Check the file format and limits, then try again.",
            )


async def _analyze_media(file: UploadFile):
    content = await read_upload_limited(file)
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    filename = os.path.basename((file.filename or "unknown").replace("\\", "/"))[:255]
    content_type = file.content_type or "application/octet-stream"
    file_size = len(content)
    kind = media_file_kind(filename, content_type)

    if kind == "video":
        result = await run_in_threadpool(analyze_video_forensics, content, filename)
    elif kind == "audio":
        result = await run_in_threadpool(analyze_audio_bytes, content, filename)
        if result.get("success"):
            result["kind"] = "audio"
            result["media_type"] = "AUDIO"
            result["risk"] = result.get("synthetic_voice", 0)
            result["signals"] = {
                "synthetic_voice": result.get("synthetic_voice", 0),
                "face_manipulation": 0,
                "media_manipulation": 0,
                "identity_consistency": 0,
                "replay_risk": 0,
                "ai_synthetic_indicator": result.get("synthetic_voice", 0),
            }
            result["findings"] = result.get("reasons", []) or [
                "No strong acoustic anomaly detected by the available heuristics."
            ]
            result["analysis_note"] = (
                "Audio results are acoustic heuristics, not definitive proof of synthetic speech."
            )
    elif kind == "image":
        result = await run_in_threadpool(analyze_image_media, content, filename, content_type)
    else:
        raise HTTPException(
            status_code=415,
            detail="Unsupported media type. Upload JPG/PNG, MP4/MOV/WebM, or WAV/MP3/M4A.",
        )

    if not result.get("success"):
        logger.warning("Media analysis failed for %s upload", kind)
        return {
            "success": False,
            "module": "media_analysis",
            "file": {
                "name": filename,
                "type": content_type,
                "size_bytes": file_size,
            },
            "error": "The uploaded media could not be decoded or analyzed. Check the file format and limits, then try again.",
        }

    risk_score = clamp_score(result.get("risk", 0))
    signals = result.get("signals", {})

    if not signals:
        signals = {
            "synthetic_voice": result.get("synthetic_voice", 0),
            "face_manipulation": result.get("face_manipulation", 0),
            "media_manipulation": result.get("media_manipulation", 0),
            "identity_consistency": result.get("identity_consistency", 0),
            "replay_risk": result.get("replay_risk", 0),
        "ai_synthetic_indicator": result.get("ai_synthetic_indicator", 0),
        }

    return {
        "success": True,
        "module": "media_analysis",
        "file": {
            "name": filename,
            "type": content_type,
            "size_bytes": file_size,
        },
        "kind": result.get("kind", kind),
        "media_type": result.get("media_type", kind.upper()),
        "risk": {
            "score": risk_score,
            "level": get_risk_level(risk_score),
        },
        "signals": signals,
        "video_forensics": result if kind == "video" else None,
        "audio_forensics": result if kind == "audio" else result.get("audio") if kind == "video" else None,
        "face": result.get("face"),
        "ocr": result.get("ocr"),
        "metadata": result.get("metadata"),
        "forensics": result.get("forensics"),
        "ai_indicators": result.get("ai_indicators"),
        "findings": result.get("findings", []),
        "summary": (
            "Lower concern based on available heuristic signals; this does not certify safety."
            if risk_score < 30
            else "One or more media authenticity signals warrant review."
        ),
        "recommendation": build_recommendation(get_risk_level(risk_score)),
        "analysis_note": result.get(
            "analysis_note",
            "Media authenticity values are heuristic indicators and should not be treated as definitive proof.",
        ),
        "analyzed_at": datetime.utcnow().isoformat() + "Z",
    }


@app.post("/api/analyze/document")
async def analyze_document(file: UploadFile = File(...)):
    async with analysis_slots:
        try:
            content = await read_upload_limited(file)
            if not content:
                raise HTTPException(status_code=400, detail="Uploaded file is empty.")

            filename = os.path.basename((file.filename or "unknown").replace("\\", "/"))[:255]
            content_type = file.content_type or "application/octet-stream"
            allowed_extensions = {
                ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".pdf",
            }
            extension = os.path.splitext(filename)[1].lower()
            if extension not in allowed_extensions:
                raise HTTPException(
                    status_code=415,
                    detail="Unsupported document format. Use JPG, PNG, WEBP, BMP, TIFF or PDF.",
                )

            return await run_in_threadpool(
                perform_document_analysis,
                content,
                filename,
                content_type,
            )
        except HTTPException:
            raise
        except Exception:
            logger.exception("Document analysis failed")
            raise HTTPException(
                status_code=422,
                detail="The document could not be decoded or analyzed. Check the file format and limits, then try again.",
            )





# ============================================================

# TRANSACTION ANALYSIS

# ============================================================



@app.post("/api/analyze/transaction")

def analyze_transaction(

    transaction: TransactionInput

):

    amount = transaction.amount



    risk = 35



    if amount >= 10000:

        risk += 20



    if amount >= 30000:

        risk += 15



    if transaction.method.upper() == "IMPS":

        risk += 10



    score = clamp_score(risk)

    level = get_risk_level(score)



    signals = []



    if amount >= 10000:

        signals.append(

            "High-value transaction"

        )



    if transaction.method.upper() == "IMPS":

        signals.append(

            "IMPS transfer pattern"

        )



    if amount >= 30000:

        signals.append(

            "Large transfer requiring review"

        )



    if not signals:

        signals.append(

            "No strong transaction anomaly detected"

        )



    return {

        "success": True,

        "module": "transaction_analysis",



        "transaction": transaction.model_dump(),



        "risk": {

            "score": score,

            "level": level,

        },



        "signals": signals,



        "recommendation": build_recommendation(

            level

        ),

    }





# ============================================================

# IDENTITY ANALYSIS

# ============================================================



@app.post("/api/analyze/identity")

def analyze_identity(

    identity: IdentityInput

):

    document_risk = (

        0

        if identity.document_verified

        else 85

    )



    face_risk = (

        100 - identity.face_match_score

    )



    phone_risk = (

        0

        if identity.phone_verified

        else 75

    )



    account_risk = (

        100 - identity.account_consistency

    )



    risk_components = [

        document_risk,

        face_risk,

        phone_risk,

        account_risk,

    ]



    score = clamp_score(

        sum(risk_components)

        / len(risk_components)

    )



    level = get_risk_level(score)



    signals = []



    if not identity.document_verified:

        signals.append(

            "Document verification incomplete"

        )



    if identity.face_match_score < 80:

        signals.append(

            "Face consistency requires review"

        )



    if not identity.phone_verified:

        signals.append(

            "Phone verification incomplete"

        )



    if identity.account_consistency < 80:

        signals.append(

            "Account consistency requires review"

        )



    if not signals:

        signals.append(

            "Identity signals are consistent"

        )



    return {

        "success": True,

        "module": "identity_analysis",



        "identity": {

            "name": identity.name,

            "phone": identity.phone,

            "email": identity.email,

            "account": identity.account,

        },



        "risk": {

            "score": score,

            "level": level,

        },



        "signals": signals,



        "checks": {

            "document_verified":

                identity.document_verified,

            "face_match":

                identity.face_match_score,

            "phone_verified":

                identity.phone_verified,

            "account_consistency":

                identity.account_consistency,

        },



        "recommendation": build_recommendation(

            level

        ),

    }





# ============================================================

# RISK FUSION

# ============================================================



@app.post(

    "/api/risk/fuse",

    response_model=RiskResponse,

)

def fuse_risk(

    data: RiskInput

):

    weights = {

        "voice": 0.25,

        "document": 0.15,

        "identity": 0.20,

        "transaction": 0.20,

        "graph": 0.20,

    }



    score = (

        data.voice_risk

        * weights["voice"]



        + data.document_risk

        * weights["document"]



        + data.identity_risk

        * weights["identity"]



        + data.transaction_risk

        * weights["transaction"]



        + data.graph_risk

        * weights["graph"]

    )



    final_score = clamp_score(

        score

    )



    level = get_risk_level(

        final_score

    )



    signals = []



    if data.voice_risk >= 70:

        signals.append(

            f"Voice anomaly risk is high "

            f"({clamp_score(data.voice_risk)}/100)"

        )



    if data.document_risk >= 70:

        signals.append(

            f"Document risk is high "

            f"({clamp_score(data.document_risk)}/100)"

        )



    if data.identity_risk >= 70:

        signals.append(

            f"Identity inconsistency is significant "

            f"({clamp_score(data.identity_risk)}/100)"

        )



    if data.transaction_risk >= 70:

        signals.append(

            f"Transaction risk is high "

            f"({clamp_score(data.transaction_risk)}/100)"

        )



    if data.graph_risk >= 70:

        signals.append(

            f"Fraud graph contains suspicious links "

            f"({clamp_score(data.graph_risk)}/100)"

        )



    if not signals:

        signals.append(

            "No individual signal currently exceeds "

            "the high-risk threshold."

        )



    return RiskResponse(

        score=final_score,

        level=level,

        signals=signals,

        recommendation=build_recommendation(

            level

        ),

    )





# ============================================================

# OPTIONAL CALL API

# ============================================================



@app.get("/api/call/{room_id}")

def get_call_room(

    room_id: str

):

    return {

        "room_id": room_id,

        "connected_clients": len(

            call_connections.get(

                room_id,

                [],

            )

        ),

        "status": "available",

    }





# ============================================================

# WEBSOCKET SIGNALING

# ============================================================



@app.websocket("/ws/call/{room_id}")

async def websocket_call(

    websocket: WebSocket,

    room_id: str,

):

    allowed_origins = {
        origin.strip()
        for origin in os.getenv(
            "TRUSTGUARD_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    }
    origin = websocket.headers.get("origin")
    if (
        not origin
        or origin not in allowed_origins
        or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", room_id)
    ):
        await websocket.close(code=1008)
        return

    async with call_connections_lock:
        if room_id not in call_connections and len(call_connections) >= MAX_SIGNALING_ROOMS:
            await websocket.close(code=1013)
            return

        if len(call_connections.get(room_id, [])) >= MAX_SIGNALING_PEERS_PER_ROOM:
            await websocket.close(code=1008)
            return

        await websocket.accept()
        call_connections.setdefault(room_id, []).append(websocket)



    try:

        while True:

            message = await websocket.receive_text()

            if len(message.encode("utf-8")) > MAX_SIGNALING_MESSAGE_BYTES:
                await websocket.close(code=1009)
                break

            try:
                json.loads(message)
            except (TypeError, json.JSONDecodeError):
                await websocket.close(code=1003)
                break



            peers = call_connections.get(

                room_id,

                [],

            )



            for peer in peers:

                if peer is websocket:

                    continue



                try:

                    await peer.send_text(

                        message

                    )

                except Exception:

                    pass



    except WebSocketDisconnect:

        pass



    finally:

        async with call_connections_lock:
            peers = call_connections.get(room_id, [])
            if websocket in peers:
                peers.remove(websocket)
            if not peers:
                call_connections.pop(room_id, None)





# ============================================================

# SERVER

# ============================================================



if __name__ == "__main__":

    import uvicorn



    uvicorn.run(

        "main:app",

        host=os.getenv("TRUSTGUARD_HOST", "127.0.0.1"),

        port=8000,

        reload=True,

    )
