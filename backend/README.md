# MIRAI Scanner Module - Backend

## Overview
FastAPI backend for the MIRAI Scanner Module that processes GitHub profiles and resume/LinkedIn PDFs to extract and structure career data using AI.

## Features
- **PDF Extraction**: Extracts text from resumes and LinkedIn profiles using pdfplumber
- **GitHub Integration**: Fetches repository data from GitHub API
- **AI Structuring**: Uses Groq LLaMA 3.1 to structure raw data into:
  - Skills (technical + soft)
  - Projects (from resume + GitHub)
  - Experience (jobs, internships, roles)
  - Certifications
  - Role predictions (top 3 careers with match percentages)
- **Database Storage**: Saves structured data to Supabase

## Setup

### 1. Activate Virtual Environment

**Windows:**
```bash
cd backend
venv\Scripts\activate
```

**Mac/Linux:**
```bash
cd backend
source venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Environment Variables
Create a `.env` file in the root directory with:
```env
GROQ_API_KEY=your_groq_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Run the Server
```bash
python main.py
```

The API will be available at `http://localhost:8000`

## API Endpoints

### Health Check
```
GET /health
```
Response:
```json
{
  "status": "ok",
  "message": "MIRAI Scanner Module is running"
}
```

### Scan Profile
```
POST /api/v1/scan
```

**Request:**
- `github_url` (form): GitHub profile URL or username (e.g., `https://github.com/username`)
- `file` (file): PDF file (Resume or LinkedIn profile)

**Response:**
```json
{
  "status": "success",
  "message": "Profile scanned and saved successfully",
  "data": {
    "skills": ["Python", "FastAPI", "React", ...],
    "projects": [...],
    "experience": [...],
    "certifications": [...],
    "rolePredictions": [
      {
        "role": "Full Stack Developer",
        "match_percentage": 85,
        "reasoning": "...",
        "required_skills": [...]
      },
      ...
    ],
    "github_username": "username",
    "repository_count": 5
  }
}
```

### Test Endpoint
```
POST /api/v1/scan/test
```
Verifies environment variables are properly configured.

## Dependencies
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `pdfplumber` - PDF text extraction
- `groq` - Groq API client for LLaMA
- `supabase` - Supabase Python client
- `python-dotenv` - Environment variable management
- `requests` - HTTP client for GitHub API
- `python-multipart` - Form file handling

## Database Schema (Supabase)

Create a `profiles` table with the following columns:
```sql
- id (UUID, Primary Key)
- github_username (text)
- skills (jsonb array)
- projects (jsonb array)
- experience (jsonb array)
- certifications (jsonb array)
- role_predictions (jsonb array)
- raw_data (jsonb)
- created_at (timestamp)
- updated_at (timestamp)
```

## Error Handling
All errors return appropriate HTTP status codes with descriptive messages:
- `400` - Bad request (invalid PDF, GitHub user not found)
- `404` - GitHub user not found
- `500` - Server errors (Groq API, database, etc.)

## Development
For debugging, use the `/api/v1/scan/test` endpoint to verify configuration.
