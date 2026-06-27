import fitz  # PyMuPDF — import name is fitz, not pymupdf
import json
from services.groq_service import call_groq_json

async def extract_pdf_data(file_bytes: bytes) -> dict:
    """
    Extracts text from PDF bytes using PyMuPDF.
    Sends extracted text to Groq to detect skills, experience, technologies.
    Returns a dict matching the ExtractedPdfData TypeScript type.
    """
    # Step 1: Extract raw text from PDF
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    raw_text = ""
    for page in doc:
        raw_text += page.get_text()
    doc.close()

    if not raw_text.strip():
        raise ValueError("PDF appears to be empty or scanned (no extractable text)")

    # Step 2: Send to Groq for structured extraction
    prompt = f"""You are a resume parser. Extract structured information from this resume/LinkedIn PDF text.

Return ONLY a valid JSON object with NO extra text, NO markdown, NO code blocks. Just raw JSON.

The JSON must have exactly these fields:
{{
  "raw_text": "...",
  "detected_skills": ["Python", "React", "SQL"],
  "detected_experience_years": 2,
  "detected_job_titles": ["Software Engineer", "Backend Developer"],
  "detected_technologies": ["FastAPI", "PostgreSQL", "Docker", "AWS"]
}}

Rules:
- detected_skills: programming languages and frameworks only
- detected_experience_years: integer, estimate from dates if not stated explicitly, default 0 if unclear
- detected_job_titles: job titles from work experience section
- detected_technologies: tools, platforms, databases, cloud services
- raw_text: copy the first 500 characters of the resume text here

Resume text:
{raw_text[:4000]}"""

    result = await call_groq_json(prompt)
    result["raw_text"] = raw_text[:500]
    return result
