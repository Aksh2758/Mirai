import os
import json
from groq import AsyncGroq
from dotenv import load_dotenv

from services.role_classifier import classify_from_sources, domain_for_family
from services.market_signals import get_trending_skills

try:
    from google import genai
    from google.genai import types
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False

load_dotenv()

_client: AsyncGroq | None = None

def get_groq() -> AsyncGroq:
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY must be set in .env")
        _client = AsyncGroq(api_key=api_key)
    return _client

MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")    

async def call_groq_json(prompt: str, system: str = "You are a helpful AI assistant.") -> dict:
    """
    Makes an AI call and parses JSON response.
    Prioritizes GEMINI_API_KEY if available in .env, otherwise uses Groq.
    """
    gemini_key = os.getenv("GEMINI_API_KEY")
    if HAS_GEMINI and gemini_key and gemini_key.strip():
        try:
            client = genai.Client(api_key=gemini_key)
            model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    temperature=0.2,
                )
            )
            return json.loads(response.text)
        except Exception as e:
            print(f"Gemini API call failed, falling back to Groq: {e}")

    client = get_groq()
    response = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,                # Lower temperature for more consistent JSON
        max_tokens=8000,
    )
    raw = response.choices[0].message.content.strip()

    # Strip <think> ... </think> reasoning blocks if present
    if "<think>" in raw and "</think>" in raw:
        raw = raw.split("</think>", 1)[1].strip()

    # Extract JSON if wrapped in markdown blocks
    if "```" in raw:
        parts = raw.split("```")
        for part in reversed(parts):
            code = part.strip()
            if code.startswith("json"):
                code = code[4:].strip()
            try:
                return json.loads(code)
            except Exception:
                continue

    # Fallback: extract substring between first { and last }
    import re
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Groq returned invalid JSON: {e}\nRaw response: {raw[:500]}")


async def call_groq_stream(messages: list[dict], system: str):
    """
    Makes a streaming Groq API call.
    Returns an async generator that yields text chunks.
    Used for the Copilot endpoint.
    """
    client = get_groq()
    stream = await client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "system", "content": system}, *messages],
        temperature=0.5,
        max_tokens=2000,
        stream=True,
    )
    async for chunk in stream:
        content = chunk.choices[0].delta.content
        if content:
            yield content


# ─── Project rules per domain (moved to module level so the classifier's families can reuse them) ───

DOMAIN_RULES = {
    "Data/ML": "All 3 projects MUST be data or machine learning projects. Use Python, pandas, scikit-learn, matplotlib, SQL, Jupyter, Streamlit, or FastAPI for serving models. Do NOT suggest web apps with React or Node.js.",
    "Frontend": "All 3 projects MUST be frontend or UI projects. Use React, Next.js, TypeScript, CSS, Tailwind. Do NOT suggest backend APIs or ML models as the main project.",
    "Backend": "All 3 projects MUST be backend or API projects. Use FastAPI/Django/Node.js with databases (PostgreSQL/MongoDB), authentication, REST APIs. Do NOT suggest React frontends as the main focus.",
    "Full Stack": "Projects should be full-stack applications combining frontend + backend. Each project must have both a UI and an API/database layer.",
    "ML/AI": "All 3 projects MUST be ML or AI projects. Use PyTorch, TensorFlow, HuggingFace, LLMs, computer vision, NLP, or similar. Do NOT suggest basic CRUD apps.",
    "DevOps": "All 3 projects MUST be DevOps or infrastructure projects. Use Docker, Kubernetes, CI/CD pipelines, cloud services, monitoring. Do NOT suggest regular web apps.",
    # Added for the classifier's extra families:
    "Data Engineering": "All 3 projects MUST be data engineering projects: ETL/ELT pipelines, SQL and warehouse modelling, workflow orchestration (Airflow or similar), streaming basics, data-quality checks. Do NOT suggest ML model training or web UIs as the main focus.",
    "Mobile": "All 3 projects MUST be mobile app projects. Use React Native, Flutter, Kotlin or Swift with a real backend or local storage. Do NOT suggest web-only apps.",
    "Security": "All 3 projects MUST be defensive or educational security projects: authentication/authorization systems, secure API hardening, log analysis and anomaly detection, vulnerability-scanning of the student's OWN apps. Do NOT suggest tools built to attack third-party systems.",
}

VALID_LEVELS = ("Beginner", "Intermediate", "Advanced")


async def analyze_skill_dna(
    github_data: dict | None,
    pdf_data: dict | None,
    manual_data: dict | None,
) -> dict:
    """
    The main AI analyzer. Takes any combination of scanner data sources.
    Returns: role, level, pace_factor, skill_scores, summary, and 3 projects.

    PIPELINE (hybrid ML + LLM):
      1. Build an evidence context from whatever scanner data exists.
      2. A trained Random Forest predicts the ROLE FAMILY from measurable features
         (stable classes, not volatile job titles). Skipped gracefully if the model
         isn't available, in which case the original LLM-only detection runs.
      3. Trending skills are pulled from the Discovery Hub's live listings.
      4. The LLM detects level and picks a SPECIFIC, current job title inside the
         classifier's family (or reasons freely if the classifier is unsure).
      5. The LLM generates skill scores, summary and 3 level-appropriate,
         market-aware projects.

    CRITICAL RULES FOR THIS FUNCTION:
    - Projects MUST match the detected level exactly (see mapping below)
    - Role detection must be based on EVIDENCE from the data, not generic guessing
    - Never mix roles with projects (don't suggest web projects for an ML user)
    """

    # ─── STEP 1: Build context string from whatever data we have ─────────────

    context_parts = []

    if github_data:
        context_parts.append(f"""
GITHUB EVIDENCE:
- Total repositories: {github_data.get('repo_count', 0)}
- Language breakdown by percentage: {json.dumps(github_data.get('top_languages', {}))}
- Commit activity level: {github_data.get('commit_frequency', 'unknown')}
- Account age: {github_data.get('account_age_years', 0)} years on GitHub
- Top repository names: {json.dumps([r.get('name','') for r in github_data.get('top_repos', [])])}
""")

    if pdf_data:
        context_parts.append(f"""
RESUME/LINKEDIN EVIDENCE:
- Programming languages and frameworks detected: {', '.join(pdf_data.get('detected_skills', []))}
- Years of experience stated or inferred: {pdf_data.get('detected_experience_years', 0)}
- Job titles found in work history: {', '.join(pdf_data.get('detected_job_titles', []))}
- Tools and technologies mentioned: {', '.join(pdf_data.get('detected_technologies', []))}
- Profile summary snippet: {pdf_data.get('raw_text', '')[:400]}
""")

    if manual_data:
        context_parts.append(f"""
SELF-REPORTED BACKGROUND:
- Skills the student says they know: {', '.join(manual_data.get('detected_skills', []))}
- Years coding (self-reported): {manual_data.get('detected_experience_years', 0)}
- Their stated goal: {manual_data.get('raw_text', '')}
""")

    full_context = "\n".join(context_parts)

    # ─── STEP 2: ML role-family prediction + live market signal ──────────────
    # rf_result is None if the model files are missing or anything fails;
    # the code below then behaves exactly like the original LLM-only version.

    rf_result = classify_from_sources(github_data, pdf_data, manual_data)

    trending = get_trending_skills(limit=12)
    trending_names = [t["skill"] for t in trending]
    market_block = ""
    market_rule = ""
    if trending_names:
        market_block = f"""
CURRENT MARKET SIGNAL (skills most requested across live job/internship listings right now):
{', '.join(trending_names)}
"""
        market_rule = """

8. MARKET RULE: prefer tech stacks that include at least one of the in-demand skills from the CURRENT MARKET SIGNAL for each project, but ONLY where it fits the DOMAIN RULE. Never force an irrelevant technology just to match the signal."""

    # ─── STEP 3: Detect level + specific role BEFORE generating projects ─────

    level_rules = """Determine their level using these STRICT rules:
- "Beginner": Less than 1 year coding OR fewer than 3 projects OR only knows 1-2 basic languages (Python basics, HTML/CSS only)
- "Intermediate": 1-3 years OR 3-8 projects OR knows multiple languages and has built at least one working app
- "Advanced": 3+ years AND 8+ projects AND has deployed real apps AND knows frameworks deeply"""

    if rf_result:
        top3 = "\n".join(
            f"  - {c['family']}: {c['probability']:.0%}" for c in rf_result["top_3"]
        )
        if rf_result["low_confidence"]:
            family_instruction = (
                "The classifier is UNCERTAIN (top probability below 50%). Treat its output only as a hint: "
                "use the evidence in the student's data to choose the best-fitting family among the top "
                "candidates (or a sensible hybrid), and name the family you chose in evidence_summary."
            )
        else:
            family_instruction = (
                f"The classifier is CONFIDENT. detected_role MUST be a specific job title that belongs to the "
                f"'{rf_result['family']}' family. Do not switch families."
            )
        title_market_hint = (
            " Where it fits the student's evidence, prefer titles that align with the CURRENT MARKET SIGNAL above."
            if trending_names else ""
        )

        level_detection_prompt = f"""You are analyzing a student's technical background to determine their exact skill level and a specific job role.

Read this data carefully:
{full_context}

A trained Random Forest classifier analysed measurable signals from this data and predicted the student's role FAMILY:
- Predicted family: {rf_result['family']} (confidence {rf_result['confidence']:.0%})
- Top candidates:
{top3}
{family_instruction}
{market_block}
{level_rules}

For detected_role: pick ONE specific, currently-used job title within the family (for example "Backend Developer (Go/Rust)" or "Machine Learning Engineer").{title_market_hint} Do not invent exotic titles.

For domain: choose the ONE best match from: {', '.join(DOMAIN_RULES.keys())}.

Return ONLY this JSON. Nothing else. No markdown. No explanation:
{{
  "level": "Beginner",
  "domain": "Backend",
  "detected_role": "Backend Developer",
  "experience_years_estimate": 1,
  "evidence_summary": "One sentence explaining WHY you chose this level and role based on actual evidence from their data"
}}"""
    else:
        # Original LLM-only detection (used when the classifier is unavailable)
        level_detection_prompt = f"""You are analyzing a student's technical background to determine their exact skill level.

Read this data carefully:
{full_context}

Determine their level using these STRICT rules:
- "Beginner": Less than 1 year coding OR fewer than 3 projects OR only knows 1-2 basic languages (Python basics, HTML/CSS only)
- "Intermediate": 1-3 years OR 3-8 projects OR knows multiple languages and has built at least one working app
- "Advanced": 3+ years AND 8+ projects AND has deployed real apps AND knows frameworks deeply

Also determine their PRIMARY domain by looking at what technologies dominate their background:
- If mostly Python + pandas/numpy/sklearn/jupyter/matplotlib/seaborn/data/csv/kaggle → "Data/ML"
- If mostly React/Vue/Angular/HTML/CSS/JavaScript/TypeScript/Next.js → "Frontend"
- If mostly Node.js/FastAPI/Django/Flask/Express/SQL/databases/APIs → "Backend"
- If a mix of frontend + backend → "Full Stack"
- If mostly TensorFlow/PyTorch/LLM/transformers/deep learning → "ML/AI"
- If mostly Docker/Kubernetes/AWS/GCP/CI/CD/Linux → "DevOps"
{market_block}
Return ONLY this JSON. Nothing else. No markdown. No explanation:
{{
  "level": "Beginner",
  "domain": "Data/ML",
  "detected_role": "Data Analyst",
  "experience_years_estimate": 1,
  "evidence_summary": "One sentence explaining WHY you chose this level and domain based on actual evidence from their data"
}}

Available roles to pick from (pick the ONE that best matches domain):
- "Backend Engineer" → for Backend domain
- "Frontend Developer" → for Frontend domain  
- "Full Stack Developer" → for Full Stack domain
- "Data Analyst" → for Data/ML domain with less ML depth
- "ML Engineer" → for ML/AI domain or Data/ML with deep ML skills
- "DevOps Engineer" → for DevOps domain
- "Mobile Developer" → if they have React Native/Flutter/Swift/Kotlin"""

    level_result = await call_groq_json(level_detection_prompt)

    detected_level = level_result.get("level", "Intermediate")
    if detected_level not in VALID_LEVELS:
        detected_level = "Intermediate"

    evidence_summary = level_result.get("evidence_summary", "")

    # Domain: when the classifier is confident its family decides the project rules
    # (deterministic, not an LLM guess). Otherwise fall back to the LLM's domain.
    if rf_result and not rf_result["low_confidence"]:
        detected_domain = domain_for_family(rf_result["family"], detected_level)
    else:
        llm_domain = level_result.get("domain")
        if llm_domain in DOMAIN_RULES:
            detected_domain = llm_domain
        elif rf_result:
            detected_domain = domain_for_family(rf_result["family"], detected_level)
        else:
            detected_domain = "Full Stack"

    detected_role = level_result.get("detected_role") or (
        rf_result["family"] if rf_result else "Full Stack Developer"
    )

    # ─── STEP 4: Define project difficulty rules based on detected level ──────
    # CRITICAL: These rules are enforced by the prompt.
    # A Beginner gets: Beginner + Intermediate + Intermediate projects
    # An Intermediate gets: Intermediate + Intermediate + Advanced projects
    # An Advanced gets: Advanced + Advanced + Advanced projects
    # We never show a Beginner project to an Intermediate user.

    if detected_level == "Beginner":
        difficulty_rule = """
Project difficulty MUST follow this rule since the student is a BEGINNER:
- Project 1 (easiest): difficulty = "Beginner" — something they can finish in 1-2 days
- Project 2 (stretch): difficulty = "Intermediate" — pushes them slightly outside comfort zone
- Project 3 (challenge): difficulty = "Intermediate" — harder stretch goal
NEVER suggest an Advanced project to a Beginner."""

    elif detected_level == "Intermediate":
        difficulty_rule = """
Project difficulty MUST follow this rule since the student is INTERMEDIATE:
- Project 1 (comfort): difficulty = "Intermediate" — solidifies their existing skills
- Project 2 (stretch): difficulty = "Intermediate" — adds 1-2 new concepts
- Project 3 (challenge): difficulty = "Advanced" — a real challenge to grow into
NEVER suggest a Beginner project to an Intermediate user. That would be insulting."""

    else:  # Advanced
        difficulty_rule = """
Project difficulty MUST follow this rule since the student is ADVANCED:
- Project 1 (baseline): difficulty = "Advanced" — still challenging for them
- Project 2 (stretch): difficulty = "Advanced" — requires deep system design thinking
- Project 3 (challenge): difficulty = "Advanced" — production-grade complexity
NEVER suggest Beginner or Intermediate projects to an Advanced user."""

    # ─── STEP 5: Domain-specific project types ────────────────────────────────
    # This prevents suggesting web projects to a data science person, etc.

    domain_instruction = DOMAIN_RULES.get(detected_domain, DOMAIN_RULES["Full Stack"])

    # ─── STEP 6: Generate the full analyzer response ──────────────────────────

    classifier_line = ""
    if rf_result:
        classifier_line = (
            f"\n- Classifier verdict: {rf_result['family']} ({rf_result['confidence']:.0%} confidence)"
        )

    main_prompt = f"""You are a senior technical mentor at a coding bootcamp. 
You have analyzed a student's background and now must give them personalized guidance.

STUDENT DATA:
{full_context}

YOUR ANALYSIS SO FAR:
- Detected role: {detected_role}
- Detected level: {detected_level}
- Detected domain: {detected_domain}
- Evidence: {evidence_summary}{classifier_line}
{market_block}
Now generate the complete analysis response.

Return ONLY this JSON. No markdown. No explanation. Just raw JSON:

{{
  "skill_dna": {{
    "role": "{detected_role}",
    "level": "{detected_level}",
    "pace_factor": "normal",
    "skill_scores": {{
      "label_1": {{ "label": "Python", "score": 75, "category": "Languages" }},
      "label_2": {{ "label": "Data Analysis", "score": 60, "category": "Domain Skills" }},
      "label_3": {{ "label": "SQL", "score": 50, "category": "Databases" }},
      "label_4": {{ "label": "Machine Learning", "score": 30, "category": "Domain Skills" }},
      "label_5": {{ "label": "Data Visualization", "score": 40, "category": "Tools" }},
      "label_6": {{ "label": "Deployment", "score": 15, "category": "DevOps" }}
    }},
    "summary": "2 sentences. First sentence: what you found in their background (be specific — mention actual languages/tools you detected). Second sentence: what their single most important next step is.",
    "strengths": ["strength 1 — specific to their data", "strength 2", "strength 3"],
    "gaps": ["gap 1 — what they need to learn next", "gap 2"]
  }},
  "projects": [
    {{
      "title": "Specific project name — not generic",
      "brief": "Exactly 2 sentences. What they will build. What real skill it proves to employers.",
      "full_explanation": "Exactly 5 sentences. Sentence 1: the overall app. Sentence 2: the first major feature to build. Sentence 3: the second major feature. Sentence 4: what makes it industry-relevant. Sentence 5: what they'll have to show employers when done.",
      "tech_stack": ["Tech1", "Tech2", "Tech3"],
      "difficulty": "Intermediate",
      "estimated_hours": 20,
      "outcome": "One sentence: what they can say in an interview about this project",
      "new_skills_introduced": ["Skill they will learn", "Another new skill"]
    }},
    {{ second project — same shape }},
    {{ third project — same shape }}
  ]
}}

STRICT RULES — violating any of these is wrong:

1. DOMAIN RULE: {domain_instruction}

2. DIFFICULTY RULE:
{difficulty_rule}

3. skill_scores RULES:
   - Use real skill names as labels (e.g. "Python", "React", "SQL", "Docker") not generic words like "Backend" or "Frontend"
   - Each score is between 0-100 based on ACTUAL EVIDENCE from their data
   - Do not make up scores — base them on what you actually saw in their profile
   - Include 5-7 skills, covering what they know AND a gap skill at low score
   - category must be one of: "Languages", "Frameworks", "Databases", "Domain Skills", "Tools", "DevOps"

4. summary: must mention at least ONE specific technology or tool you actually detected in their data

5. pace_factor: 
   - "fast" if repo_count > 15 OR commit_frequency is "high" OR experience_years > 3
   - "slow" if repo_count < 5 AND experience_years < 1
   - "normal" for everything else

6. estimated_hours: realistic hours for the difficulty
   - Beginner project: 8-20 hours
   - Intermediate project: 20-50 hours  
   - Advanced project: 50-120 hours

7. projects must be genuinely different from each other — different tech stacks, different problem domains{market_rule}"""

    main_result = await call_groq_json(main_prompt)

    # ─── STEP 7: Validate the response before returning ───────────────────────
    # If Groq returned garbage structure, raise an error with details

    if "skill_dna" not in main_result:
        raise ValueError(f"Groq response missing 'skill_dna' key. Got keys: {list(main_result.keys())}")

    if "projects" not in main_result:
        raise ValueError(f"Groq response missing 'projects' key. Got keys: {list(main_result.keys())}")

    if len(main_result["projects"]) != 3:
        raise ValueError(f"Groq returned {len(main_result['projects'])} projects instead of 3")

    # Validate each project has required fields
    required_project_fields = ["title", "brief", "full_explanation", "tech_stack", "difficulty", "estimated_hours", "outcome", "new_skills_introduced"]
    for i, project in enumerate(main_result["projects"]):
        for field in required_project_fields:
            if field not in project:
                raise ValueError(f"Project {i+1} is missing field '{field}'")

    # ─── STEP 8: Attach the model verdict and market signal for the frontend ──
    # role and level come from the detection step so they can't drift in the
    # second LLM call. The extra fields are additive; existing frontend code
    # that ignores them keeps working.

    skill_dna = main_result["skill_dna"]
    skill_dna["role"] = detected_role
    skill_dna["level"] = detected_level
    skill_dna["domain"] = detected_domain
    skill_dna["role_model"] = rf_result            # None if the classifier wasn't used
    skill_dna["market_skills"] = trending          # [] if no listings were available

    return main_result
