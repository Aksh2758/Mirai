"""
LinkedIn Post Generator
Uses Groq to generate a professional LinkedIn post after project deployment.
The user reviews and copies the post — we never auto-post (LinkedIn ToS).
"""

from services.groq_service import call_groq_json


async def generate_linkedin_post(
    project_title: str,
    project_brief: str,
    tech_stack: list[str],
    github_url: str,
    live_url: str,
    psi_score: int | None,
    user_level: str,
    role: str | None,
) -> dict:
    """
    Generates a LinkedIn post draft for the student to share after deploying.
    Returns:
    {
        "post": "full post text with hashtags",
        "headline": "short 1-line summary",
        "hashtags": ["#Python", "#FastAPI", ...]
    }
    """
    tech_str = ", ".join(tech_stack)
    psi_line = f"PSI Score: {psi_score}/100" if psi_score else ""
    role_line = f"My target role is {role}." if role else "I'm building towards a career in software development."

    prompt = f"""You are a career coach helping a {user_level} developer share their first real project on LinkedIn.

Project Details:
- Title: {project_title}
- What it does: {project_brief}
- Tech stack: {tech_str}
- GitHub: {github_url}
- Live demo: {live_url}
- {psi_line}
- {role_line}

Write a compelling, authentic LinkedIn post for this student. 

Requirements:
- Sound genuine and excited, NOT corporate or cringey
- Mention the tech stack naturally
- Include the GitHub link and live URL
- Be specific about what they built (mention the project title)
- Subtly mention they used AI guidance (Nirmaan) to build it
- 3-4 short paragraphs, each 1-3 sentences
- End with 5-7 relevant hashtags
- Total length: 150-220 words
- Tone: proud student sharing their first real project, not a CEO announcement

Return ONLY valid JSON. No markdown. No explanation. Just raw JSON.

{{
  "post": "Full post text here with \\n for paragraph breaks and hashtags at end",
  "headline": "One-line summary under 15 words for post preview",
  "hashtags": ["#Python", "#FastAPI", "#OpenToWork"]
}}"""

    result = await call_groq_json(prompt)

    # Validate
    if "post" not in result:
        return {
            "post": f"Just shipped my latest project: {project_title}! 🚀\n\nBuilt with {tech_str}. This was a real challenge but I learned so much.\n\nCheck it out:\n🔗 Live: {live_url}\n💻 GitHub: {github_url}\n\n#buildinpublic #coding #softwaredevelopment",
            "headline": f"Just shipped: {project_title}",
            "hashtags": ["#buildinpublic", "#coding", "#softwaredevelopment"]
        }

    return result
