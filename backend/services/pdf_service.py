import fitz  # PyMuPDF
from fastapi import HTTPException

def extract_text(file_bytes: bytes) -> tuple[str, int]:
    """
    Extracts text from a PDF file using PyMuPDF (fitz).
    Returns a tuple of (extracted_text, page_count)
    """
    try:
        # Open the PDF from raw bytes
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        
        text = ""
        for page in doc:
            text += page.get_text() + "\n"
        
        page_count = len(doc)
        doc.close()
        return text.strip(), page_count
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"PDF extraction failed: {str(e)}")
