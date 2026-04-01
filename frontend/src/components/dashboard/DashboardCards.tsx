"use client";

export function TodoCard() {
  const todos = [
    {
      id: 1,
      text: "Set up FastAPI project structure",
      time: "Completed yesterday",
      done: true,
      inProgress: false,
    },
    {
      id: 2,
      text: "Implement JWT authentication",
      time: "In progress · Est. 2h",
      done: false,
      inProgress: true,
    },
    {
      id: 3,
      text: "Add rate limiting middleware",
      time: "Up next",
      done: false,
      inProgress: false,
    },
  ];

  return (
    <div className="card todo-card">
      <div className="card-label">
        To-Do <a style={{ cursor: "pointer" }}>+ Edit</a>
      </div>
      {todos.map((todo) => (
        <div key={todo.id} className={`todo-item ${todo.done ? "done" : ""}`}>
          <div className="todo-check"></div>
          <div>
            <div className="todo-text">{todo.text}</div>
            <div className="todo-time">{todo.time}</div>
          </div>
        </div>
      ))}
      <div className="todo-add">
        <span>+</span> Add task manually
      </div>
    </div>
  );
}

export function InternshipCard() {
  const internships = [
    {
      company: "Razorpay",
      match: 91,
      role: "Backend Intern · Bangalore · ₹25k/mo",
      tags: ["Python", "FastAPI", "PostgreSQL"],
    },
    {
      company: "Zepto",
      match: 87,
      role: "SDE Intern · Remote · ₹30k/mo",
      tags: ["Django", "Redis"],
    },
    {
      company: "Swiggy",
      match: 74,
      role: "Backend Intern · Bangalore · ₹20k/mo",
      tags: ["Node.js", "MongoDB"],
    },
  ];

  return (
    <div className="card internship-card">
      <div className="card-label">
        Internship Matches <a style={{ cursor: "pointer" }}>View all →</a>
      </div>
      {internships.map((internship, idx) => (
        <div key={idx} className="internship-item">
          <div className="internship-row1">
            <div className="internship-company">{internship.company}</div>
            <span className={`match-badge ${internship.match > 85 ? "high" : "med"}`}>
              {internship.match}% match
            </span>
          </div>
          <div className="internship-role">{internship.role}</div>
          <div className="internship-tags">
            {internship.tags.map((tag, tagIdx) => (
              <span key={tagIdx} className="tech-tag">
                {tag}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProjectCard() {
  const steps = [
    {
      id: 1,
      title: "Project setup & structure",
      desc: "FastAPI boilerplate, folder structure",
      status: "done",
    },
    {
      id: 2,
      title: "JWT Authentication",
      desc: "Login, signup, token refresh — in progress",
      status: "active",
    },
    {
      id: 3,
      title: "Database models & migrations",
      desc: "SQLAlchemy + Alembic setup",
      status: "locked",
    },
    {
      id: 4,
      title: "Rate limiting middleware",
      desc: "Redis-backed rate limiter",
      status: "locked",
    },
    {
      id: 5,
      title: "Dockerize & deploy",
      desc: "Dockerfile + docker-compose",
      status: "locked",
    },
  ];

  return (
    <div className="card project-card">
      <div className="card-label">Current Project</div>
      <div className="project-title">REST API with Auth & Rate Limiting</div>
      <div className="project-desc">
        Production-grade FastAPI backend with JWT auth, PostgreSQL, rate limiting, and
        Dockerized deployment.
      </div>

      <div className="project-progress">
        <div className="progress-label">
          <span>Step 2 of 5</span>
          <span>40%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill"></div>
        </div>
      </div>

      <div className="step-list">
        {steps.map((step) => (
          <div key={step.id} className="step-item">
            <div className={`step-dot ${step.status}`}>
              {step.status === "done" ? "✓" : step.status === "active" ? "●" : step.id}
            </div>
            <div className="step-content">
              <h4>{step.title}</h4>
              <p>{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="project-actions">
        <button className="proj-btn primary">Open Studio →</button>
        <button className="proj-btn ghost">PSI Check</button>
      </div>
    </div>
  );
}

export function HackathonCard() {
  const hackathons = [
    {
      icon: "🛠️",
      name: "HackIndia 2025",
      location: "Online · Feb 10",
      tag: "Python · AI/ML",
    },
    {
      icon: "⚡",
      name: "ETHIndia",
      location: "Bangalore · Mar 5",
      tag: "Web3 · Backend",
    },
  ];

  return (
    <div className="card hackathon-card">
      <div className="card-label">
        Hackathon Discovery <a style={{ cursor: "pointer" }}>Browse all →</a>
      </div>
      {hackathons.map((hack, idx) => (
        <div key={idx} className="hack-item">
          <div className="hack-icon">{hack.icon}</div>
          <div>
            <div className="hack-name">{hack.name}</div>
            <div className="hack-meta">
              <span>{hack.location}</span>
              <span className="hack-tag">{hack.tag}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function GroomingCard() {
  const items = [
    {
      icon: "📄",
      color: "blue",
      name: "Resume Builder",
      sub: "Tailor to any job description",
    },
    {
      icon: "🎤",
      color: "orange",
      name: "Mock Interview",
      sub: "Based on your REST API project",
    },
    {
      icon: "📝",
      color: "green",
      name: "Aptitude Practice",
      sub: "Quant, logical, verbal",
    },
  ];

  return (
    <div className="card grooming-card">
      <div className="card-label">Grooming Lab</div>
      {items.map((item, idx) => (
        <div key={idx} className="grm-item">
          <div className={`grm-icon ${item.color}`}>{item.icon}</div>
          <div className="grm-text">
            <div className="name">{item.name}</div>
            <div className="sub">{item.sub}</div>
          </div>
          <div className="grm-arrow">→</div>
        </div>
      ))}
    </div>
  );
}

export function SkillCard() {
  const skills = [
    { text: "FastAPI", level: "hot", size: "lg" },
    { text: "PostgreSQL", level: "hot" },
    { text: "Docker", level: "warm", size: "lg" },
    { text: "Redis", level: "cool" },
    { text: "JWT", level: "hot", size: "sm" },
    { text: "Kubernetes", level: "cool", size: "lg" },
    { text: "CI/CD", level: "warm", size: "sm" },
    { text: "GraphQL", level: "cool" },
    { text: "Celery", level: "warm" },
    { text: "Pydantic", level: "hot", size: "sm" },
  ];

  return (
    <div className="card skill-card">
      <div className="card-label">
        Skill Hub — Trending in your track <a style={{ cursor: "pointer" }}>Explore →</a>
      </div>
      <div className="skill-bubble-area">
        {skills.map((skill, idx) => (
          <div key={idx} className={`skill-bubble ${skill.level}${skill.size ? ` ${skill.size}` : ""}`}>
            {skill.text}
          </div>
        ))}
      </div>
    </div>
  );
}
