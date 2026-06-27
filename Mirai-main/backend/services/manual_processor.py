import json
from services.groq_service import call_groq_json

# These are the exact 8 questions shown in the frontend ManualTab
# Do NOT change question IDs — frontend and backend must match
MANUAL_QUESTIONS = [
    {"id": 1, "question": "Which programming languages do you know? (list them)"},
    {"id": 2, "question": "Which domain interests you most?", "options": ["Web Development", "Machine Learning / AI", "Mobile Apps", "Data Analysis", "DevOps / Cloud", "Not sure yet"]},
    {"id": 3, "question": "How many years have you been coding?", "options": ["Less than 1 year", "1-2 years", "2-4 years", "4+ years"]},
    {"id": 4, "question": "How many personal/college projects have you built so far?", "options": ["0", "1-2", "3-5", "More than 5"]},
    {"id": 5, "question": "What is your main goal right now?", "options": ["Get an internship", "Get a full-time job", "Freelancing", "Just learning"]},
    {"id": 6, "question": "How many hours per week can you dedicate to building?", "options": ["Less than 5 hours", "5-10 hours", "10-20 hours", "More than 20 hours"]},
    {"id": 7, "question": "Have you worked with databases before?", "options": ["No", "Yes, basic SQL", "Yes, SQL and NoSQL", "Yes, advanced (indexing, optimization)"]},
    {"id": 8, "question": "Have you deployed anything to the internet?", "options": ["No", "Yes, a static website", "Yes, a backend/API", "Yes, a full-stack app"]},
]

async def process_manual_answers(answers: list[dict]) -> dict:
    """
    Takes the user's quiz answers and converts them into a structured
    ExtractedPdfData-compatible dict so the Analyzer gets the same shape
    regardless of which scanner path was used.

    answers: list of {"question_id": int, "question": str, "answer": str}
    """
    # Build a readable summary for Groq
    qa_summary = "\n".join(
        f"Q{a['question_id']}: {a['question']}\nA: {a['answer']}"
        for a in answers
    )

    prompt = f"""You are analyzing a student's self-reported coding background.
Based on their answers below, extract structured data.

Return ONLY a valid JSON object with NO extra text, NO markdown, NO code blocks. Just raw JSON.

{{
  "raw_text": "summary of the student based on their answers",
  "detected_skills": ["Python", "SQL"],
  "detected_experience_years": 1,
  "detected_job_titles": [],
  "detected_technologies": ["Flask", "MySQL"]
}}

Rules:
- detected_skills: infer from their stated languages and domain interest
- detected_experience_years: infer from years coding answer (less than 1 year = 0, 1-2 years = 1, etc)
- detected_job_titles: leave empty [] since this is a student
- detected_technologies: infer likely tools from their domain and experience level
- raw_text: write a 2-sentence human-readable summary of who this student is

Student's answers:
{qa_summary}"""

    result = await call_groq_json(prompt)
    return result
