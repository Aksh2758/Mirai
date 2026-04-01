// Mock Supabase Client to safely render the UI without blocking on backend configuration
export const supabase = {
  functions: {
    invoke: async (name: string, payload: any) => {
      if (name === 'parse-resume') {
        return {
          data: {
            user_id: "test_user_777",
            skills: ["React", "Next.js", "Python", "TypeScript", "FastAPI"],
            level: "Intermediate",
            target_role: "Full Stack Software Engineer"
          }
        };
      }
      if (name === 'generate-projects') {
        return {
          data: {
            projects: [
              {
                id: "proj_1",
                title: "AI E-Commerce Scraper",
                description: "Build an automated scraper that gathers pricing data and uses AI to summarize competition.",
                difficulty: "Intermediate",
                guide_markdown: ""
              },
              {
                id: "proj_2",
                title: "Real-time Collaboration Board",
                description: "WebSockets + React canvas for live collaboration.",
                difficulty: "Advanced",
                guide_markdown: ""
              }
            ]
          }
        };
      }
      return { data: null };
    }
  },
  from: (table: string) => ({
    select: (...args: any[]) => ({
      eq: (...args: any[]) => {
        const query = {
          single: async () => {
            if (table === 'users') {
              return { data: { id: "test_user_777", skills: ["React", "Python", "Tailwind"], level: "Intermediate", target_role: "Full Stack Software Engineer" } };
            }
            return { data: null };
          },
          then: (resolve: any) => {
            if (table === 'projects') {
              resolve({ data: [
                {
                  id: "proj_0",
                  title: "Setup Architecture",
                  description: "Initialize the frontend and backend microservices.",
                  difficulty: "Beginner",
                  guide_markdown: ""
                }
              ] });
            }
            return Promise.resolve({ data: [] });
          }
        };
        // Quick hack to allow await eq() mapping if they don't call single
        return Object.assign(Promise.resolve({ data: [] }), query);
      }
    })
  })
};
