export type TaskCategory = "Language" | "DSA" | "Frontend" | "Backend" | "Data" | "Testing" | "Custom"
export type TaskLanguage = "python" | "javascript"

export interface SuggestedTask {
  id: string
  title: string
  skill: string
  level: "Beginner" | "Intermediate" | "Advanced"
  category: TaskCategory
  goal: string
  hint: string
  example: string
  language: TaskLanguage
}

type InputKind = "text" | "numbers" | "records" | "intervals" | "graph"
interface Blueprint {
  id: string
  title: string
  skill: string
  level: SuggestedTask["level"]
  category: TaskCategory
  input: InputKind
  goal: string
  hint: string
}
interface Scenario { name: string; example: unknown }

// Each blueprint teaches a distinct pattern. The 28 input contexts per
// blueprint make the practice library 1,344 guided variations while keeping
// the learning objective and hint explicit for every exercise.
const blueprints: Blueprint[] = [
  { id: "reverse-text", title: "Reverse the text", skill: "Strings", level: "Beginner", category: "Language", input: "text", goal: "Return the input text in reverse order.", hint: "Build the result from the last character back to the first." },
  { id: "count-character", title: "Count a character", skill: "Loops and strings", level: "Beginner", category: "Language", input: "text", goal: "Count how many times the target character appears, ignoring letter case.", hint: "Normalize both values, then count matching characters." },
  { id: "palindrome", title: "Check for a palindrome", skill: "String normalization", level: "Beginner", category: "Language", input: "text", goal: "Return whether the text reads the same forward and backward after normalization.", hint: "Create a normalized copy, reverse it, and compare the two." },
  { id: "longest-word", title: "Find the longest word", skill: "Strings and comparisons", level: "Beginner", category: "Language", input: "text", goal: "Return the longest word in the supplied text.", hint: "Split into words and keep the longest value seen so far." },
  { id: "word-frequency", title: "Count word frequencies", skill: "Maps and strings", level: "Intermediate", category: "Language", input: "text", goal: "Return a case-insensitive count for every word.", hint: "Normalize and split the text, then increment a map entry per word." },
  { id: "run-length", title: "Compress repeated characters", skill: "String traversal", level: "Intermediate", category: "Language", input: "text", goal: "Encode each run of repeated characters as the character followed by its count.", hint: "Track the current character and its run length as you scan once." },
  { id: "key-value-parser", title: "Parse key-value pairs", skill: "Parsing", level: "Intermediate", category: "Language", input: "text", goal: "Parse comma-separated key=value entries into a dictionary, trimming extra spaces.", hint: "Split entries first, then split each entry once at the equals sign." },
  { id: "safe-template", title: "Fill a message template", skill: "Maps and strings", level: "Advanced", category: "Language", input: "records", goal: "Replace every {name} placeholder with its matching value and leave unknown placeholders unchanged.", hint: "Scan placeholders and use a lookup map with a clear missing-key fallback." },

  { id: "sum-values", title: "Add the values", skill: "Arrays and loops", level: "Beginner", category: "DSA", input: "numbers", goal: "Return the sum of every value, including negative values.", hint: "Start with zero and add each value once." },
  { id: "find-extreme", title: "Find the largest value", skill: "Arrays and comparisons", level: "Beginner", category: "DSA", input: "numbers", goal: "Return the largest number without assuming all values are positive.", hint: "Initialize from the first item instead of zero." },
  { id: "unique-values", title: "Remove duplicate values", skill: "Sets and arrays", level: "Beginner", category: "DSA", input: "numbers", goal: "Keep the first occurrence of each value and preserve input order.", hint: "Use a set to check whether a value has already been added." },
  { id: "pair-sum", title: "Find a pair that reaches the target", skill: "Hash maps", level: "Intermediate", category: "DSA", input: "numbers", goal: "Given {values} and target 10, return the indices of two different values that add to it, or an empty list.", hint: "For each value, look up target minus value among values already seen." },
  { id: "rotate-array", title: "Rotate the sequence", skill: "Array indexing", level: "Intermediate", category: "DSA", input: "numbers", goal: "Rotate the array right by two positions without losing any items.", hint: "Reduce the rotation by the array length, then join the tail and head." },
  { id: "binary-search", title: "Find a value with binary search", skill: "Binary search", level: "Intermediate", category: "DSA", input: "numbers", goal: "Return the index of target 7 in the sorted input, or -1 if it is absent.", hint: "Keep a low and high boundary and discard half the range each step." },
  { id: "merge-sorted", title: "Merge two sorted lists", skill: "Two pointers", level: "Intermediate", category: "DSA", input: "numbers", goal: "Return one sorted list by merging the two sorted lists in the input.", hint: "Use one pointer per list and append the smaller next value." },
  { id: "max-subarray", title: "Find the best contiguous run", skill: "Dynamic programming", level: "Advanced", category: "DSA", input: "numbers", goal: "Return the largest sum of any contiguous segment.", hint: "At each value, decide whether to extend the previous run or start a new one." },
  { id: "brackets", title: "Validate bracket order", skill: "Stacks", level: "Intermediate", category: "DSA", input: "text", goal: "Return whether every opening bracket closes in the correct nested order.", hint: "Push open brackets onto a stack; each closing bracket must match the top." },
  { id: "merge-intervals", title: "Merge overlapping ranges", skill: "Sorting and intervals", level: "Intermediate", category: "DSA", input: "intervals", goal: "Merge overlapping ranges and return them sorted by start time.", hint: "Sort by start; compare each range with the end of the last merged range." },
  { id: "graph-bfs", title: "Find the shortest unweighted route", skill: "Graphs and BFS", level: "Advanced", category: "DSA", input: "graph", goal: "Return the fewest edges from the first node to the last node, or -1 if unreachable.", hint: "Use a queue and mark nodes visited when you enqueue them." },
  { id: "graph-dfs", title: "Explore every reachable node", skill: "Graphs and DFS", level: "Advanced", category: "DSA", input: "graph", goal: "Return all nodes reachable from the first node without visiting a node twice.", hint: "Use a visited set and a stack or recursive depth-first search." },
  { id: "top-frequent", title: "Return the most frequent values", skill: "Hash maps and heaps", level: "Advanced", category: "DSA", input: "numbers", goal: "Return the three most frequent values, breaking ties by smaller value first.", hint: "Count first, then order by frequency and apply a deterministic tie-break." },
  { id: "longest-unique-window", title: "Find the longest unique window", skill: "Sliding window", level: "Advanced", category: "DSA", input: "text", goal: "Return the length of the longest substring with no repeated characters.", hint: "Move a sliding window and remember the last index of each character." },
  { id: "coin-change", title: "Make a target amount", skill: "Dynamic programming", level: "Advanced", category: "DSA", input: "numbers", goal: "Find the fewest coins to make amount 11, or return -1 when it cannot be made.", hint: "Build a bottom-up table where each amount uses the best smaller amount." },
  { id: "lru-events", title: "Simulate a least-recently-used cache", skill: "Maps and linked ordering", level: "Advanced", category: "DSA", input: "records", goal: "Process get/put events with capacity three and report the final key order, least recent first.", hint: "Combine constant-time key lookup with a structure that updates recency." },
  { id: "schedule-ranges", title: "Choose non-overlapping events", skill: "Greedy algorithms", level: "Intermediate", category: "DSA", input: "intervals", goal: "Return the largest set of non-overlapping events.", hint: "Sort by end time and always take the next event that fits." },

  { id: "filter-cards", title: "Filter a list by a search phrase", skill: "Arrays and UI state", level: "Beginner", category: "Frontend", input: "records", goal: "Return only cards whose name contains the search phrase 'a', ignoring case.", hint: "Normalize both the query and each searchable field before matching." },
  { id: "sort-cards", title: "Sort cards by score", skill: "Sorting", level: "Beginner", category: "Frontend", input: "records", goal: "Return cards sorted from highest score to lowest without mutating the original list.", hint: "Copy the array before sorting and return a numeric comparator." },
  { id: "form-validation", title: "Validate a sign-up form", skill: "Forms and validation", level: "Beginner", category: "Frontend", input: "records", goal: "Return clear errors for missing name, invalid email, and passwords shorter than eight characters.", hint: "Validate each field independently and return errors keyed by field name." },
  { id: "paginate", title: "Build a page of results", skill: "Pagination", level: "Intermediate", category: "Frontend", input: "records", goal: "Return page two with page size five and the total number of records.", hint: "Compute start = (page - 1) × pageSize, then slice the filtered list." },
  { id: "group-cards", title: "Group cards by category", skill: "Maps and UI data", level: "Intermediate", category: "Frontend", input: "records", goal: "Return a map from category to the cards in that category.", hint: "Create a group the first time you see a category, then append to it." },
  { id: "toggle-favorite", title: "Update a favorite immutably", skill: "Immutable state", level: "Intermediate", category: "Frontend", input: "records", goal: "Toggle the favorite flag for item id 2 without changing the original records.", hint: "Map to a new array and create a new object only for the matching item." },
  { id: "stable-sort", title: "Keep ties stable while sorting", skill: "Sorting and UI consistency", level: "Advanced", category: "Frontend", input: "records", goal: "Sort by score but preserve the original order when scores tie.", hint: "Pair each record with its original index and use that index as a tie-break." },
  { id: "accessible-tabs", title: "Model accessible tab navigation", skill: "Accessibility and state", level: "Advanced", category: "Frontend", input: "records", goal: "Given tabs and an active index, return the next index for ArrowRight and wrap at the end.", hint: "Use modulo arithmetic and keep the active index within the tab count." },

  { id: "validate-payload", title: "Validate an API payload", skill: "Input validation", level: "Beginner", category: "Backend", input: "records", goal: "Return field errors for missing name, invalid email, or a negative quantity.", hint: "Treat request input as untrusted; validate type, presence, and ranges." },
  { id: "parse-query", title: "Normalize request filters", skill: "HTTP and query parsing", level: "Beginner", category: "Backend", input: "records", goal: "Normalize search text and clamp page size to the range 1–50.", hint: "Parse values defensively and apply defaults before the database query." },
  { id: "dedupe-events", title: "Ignore duplicate events", skill: "Idempotency", level: "Intermediate", category: "Backend", input: "records", goal: "Keep the first event for each requestId and preserve arrival order.", hint: "Track processed request IDs in a set." },
  { id: "rate-limit", title: "Apply a request limit", skill: "Rate limiting", level: "Intermediate", category: "Backend", input: "records", goal: "For each incoming request, allow at most three requests per user in the supplied time window.", hint: "Group timestamps by user, discard expired entries, then compare with the limit." },
  { id: "retry-policy", title: "Plan retries with backoff", skill: "Reliability", level: "Intermediate", category: "Backend", input: "numbers", goal: "For each attempt number in the input, return its retry delay starting at one second, doubling each time and capped at eight seconds.", hint: "Calculate each delay from the attempt index and clamp it to the cap." },
  { id: "permission-check", title: "Check access by role", skill: "Authorization", level: "Intermediate", category: "Backend", input: "records", goal: "Return whether each listed action is allowed for the supplied user role.", hint: "Keep the policy explicit: identify allowed roles per action and deny by default." },
  { id: "endpoint-metrics", title: "Summarize endpoint traffic", skill: "Aggregation", level: "Advanced", category: "Backend", input: "records", goal: "Return request count and average duration grouped by endpoint.", hint: "Accumulate count and total duration per endpoint, then compute averages." },
  { id: "ttl-cache", title: "Expire stale cache entries", skill: "Caching", level: "Advanced", category: "Backend", input: "records", goal: "Return only cache entries whose expiry timestamp is after the supplied current time.", hint: "Compare timestamps with one consistent clock value and avoid keeping expired keys." },

  { id: "mean-values", title: "Calculate a mean", skill: "Statistics", level: "Beginner", category: "Data", input: "numbers", goal: "Return the arithmetic mean, or null when there are no values.", hint: "Handle the empty list before dividing the sum by the count." },
  { id: "clean-missing", title: "Clean missing measurements", skill: "Data cleaning", level: "Beginner", category: "Data", input: "numbers", goal: "Remove missing values while keeping valid zero and negative values.", hint: "Check specifically for missing values; do not treat zero as missing." },
  { id: "grouped-total", title: "Calculate totals by category", skill: "Aggregation", level: "Intermediate", category: "Data", input: "records", goal: "Return the sum of amount grouped by category.", hint: "Accumulate one numeric total per group key." },
  { id: "moving-average", title: "Calculate a moving average", skill: "Sliding window", level: "Intermediate", category: "Data", input: "numbers", goal: "Return each three-value moving average in order.", hint: "Use a rolling sum so each next window only adds and removes one value." },
  { id: "outlier-detection", title: "Flag unusual measurements", skill: "Statistics", level: "Advanced", category: "Data", input: "numbers", goal: "Flag values more than two standard deviations from the mean.", hint: "Compute mean and standard deviation, then compare absolute distance." },
  { id: "normalize-records", title: "Normalize inconsistent records", skill: "Data quality", level: "Advanced", category: "Data", input: "records", goal: "Return records with trimmed names and a consistent missing category value.", hint: "Create normalized copies and apply one explicit rule for missing fields." },

  { id: "edge-cases", title: "Handle empty and boundary inputs", skill: "Test-driven thinking", level: "Beginner", category: "Testing", input: "numbers", goal: "Return a result for empty, single-item, negative, and duplicate-value inputs without throwing.", hint: "List the boundary cases first, then make the implementation satisfy each one." },
  { id: "deterministic-output", title: "Make output deterministic", skill: "Testing and reproducibility", level: "Intermediate", category: "Testing", input: "records", goal: "Sort output by score and then name so equal-score runs always return the same order.", hint: "Define a secondary comparison instead of relying on incidental input order." },
]

const textContexts = ["book titles", "city names", "course names", "commit messages", "recipe titles", "product labels", "student names", "movie titles", "street names", "project descriptions", "playlist names", "support messages", "file names", "team names", "search phrases", "notification text", "event titles", "article headings", "sensor labels", "release notes", "task names", "restaurant names", "travel notes", "profile bios", "chat messages", "invoice labels", "meeting titles", "repository names"]
const arrayContexts = ["quiz scores", "daily temperatures", "package weights", "response times", "sale prices", "lap times", "step counts", "sensor readings", "test results", "inventory counts", "page views", "delivery minutes", "energy readings", "match points", "monthly costs", "commute times", "course grades", "download sizes", "server loads", "survey ratings", "transaction amounts", "distance samples", "build durations", "weekly hours", "water levels", "memory readings", "ticket counts", "battery levels"]
const recordContexts = ["course enrollments", "internship listings", "shop products", "support tickets", "library books", "student profiles", "event registrations", "sensor records", "team tasks", "delivery orders", "API requests", "application logs", "test runs", "expense rows", "music tracks", "job applications", "weather reports", "meeting notes", "feature flags", "user permissions", "cache entries", "web analytics", "model results", "inventory records", "customer feedback", "flight options", "project cards", "quiz questions"]
const intervalContexts = ["room bookings", "study sessions", "calendar events", "maintenance windows", "delivery slots", "work shifts", "focus blocks", "class periods", "flight windows", "deployment windows", "reservations", "meeting slots", "network outages", "subscription periods", "service windows", "event schedules", "office hours", "exam slots", "release windows", "travel legs", "ad breaks", "rental periods", "support shifts", "compute windows", "training blocks", "pickup windows", "time ranges", "availability slots"]
const graphContexts = ["course prerequisites", "city routes", "friend connections", "build dependencies", "web page links", "team reporting lines", "package dependencies", "workflow steps", "server routes", "metro stations", "game rooms", "project tasks", "API dependencies", "file imports", "social connections", "warehouse paths", "state transitions", "network nodes", "class links", "travel stops", "service calls", "knowledge topics", "device links", "road junctions", "process stages", "lesson paths", "organization units", "search states"]

const textSamples = ["Nirmaan builds better habits", "React makes reusable user interfaces", "Learning by building projects", "Clean code is easier to change", "Practice one step at a time", "TypeScript catches useful mistakes", "Debugging starts with evidence"]
const contextList = (names: string[], examples: unknown[]): Scenario[] => names.map((name, index) => ({ name, example: examples[index % examples.length] }))
const scenarios: Record<InputKind, Scenario[]> = {
  text: contextList(textContexts, textSamples),
  numbers: contextList(arrayContexts, [[4, 1, 7, 1, -2, 9], [12, 15, 11, 18, 15], [3, -4, 8, 0, 6], [21, 13, 21, 5, 8], [2, 4, 6, 8, 10], [9, 3, 5, 3, 7]]),
  records: contextList(recordContexts, [
    [{ id: 1, name: "Alpha", category: "A", score: 8, amount: 12, duration: 4, role: "member", allowed: true, expiresAt: 20, requestId: "r1", timestamp: 1 }, { id: 2, name: "Beta", category: "B", score: 5, amount: 7, duration: 8, role: "admin", allowed: false, expiresAt: 30, requestId: "r2", timestamp: 2 }, { id: 3, name: "Gamma", category: "A", score: 8, amount: 4, duration: 6, role: "member", allowed: true, expiresAt: 10, requestId: "r1", timestamp: 3 }],
    [{ id: 1, name: "  Mira ", category: "A", score: 3, amount: 5, duration: 9, role: "viewer", allowed: true, expiresAt: 40, requestId: "q1", timestamp: 4 }, { id: 2, name: "Noor", category: "A", score: 9, amount: 15, duration: 3, role: "editor", allowed: false, expiresAt: 15, requestId: "q2", timestamp: 7 }, { id: 3, name: "Dev", category: "C", score: 9, amount: 6, duration: 4, role: "admin", allowed: true, expiresAt: 55, requestId: "q2", timestamp: 9 }],
  ]),
  intervals: contextList(intervalContexts, [[[1, 3], [2, 5], [7, 9], [8, 10]], [[0, 2], [3, 4], [4, 8], [10, 12]], [[5, 7], [1, 4], [3, 6], [9, 11]]]),
  graph: contextList(graphContexts, [
    { start: "A", target: "D", edges: { A: ["B", "C"], B: ["D"], C: ["D"], D: [], E: [] } },
    { start: "A", target: "F", edges: { A: ["B"], B: ["C", "D"], C: ["E"], D: ["E"], E: ["F"], F: [] } },
  ]),
}

function exampleFor(blueprint: Blueprint, scenario: Scenario, index: number): unknown {
  const numberValues = Array.isArray(scenario.example) && scenario.example.every((value): value is number => typeof value === "number")
    ? scenario.example
    : []
  const sorted = [...numberValues].sort((a, b) => a - b)
  switch (blueprint.id) {
    case "count-character": return textSamples[index % textSamples.length]
    case "key-value-parser": return `name= Learner${index + 1}, role=student, topic=practice-${index + 1}`
    case "safe-template": return { template: "Hello {name}, welcome to {course}", values: { name: "Asha", course: "Nirmaan" } }
    case "pair-sum": return { values: numberValues, target: 10 }
    case "binary-search": return sorted
    case "merge-sorted": return [sorted.slice(0, 3), sorted.slice(3)]
    case "max-subarray": return [4, -2, 5, -7, 3, 6, -1]
    case "brackets": return ["{[()]}", "([)]", "((()))", "[{}]"][index % 4]
    case "coin-change": return [1, 2, 5, 7]
    case "form-validation": return { name: "Asha", email: index % 2 ? "asha@example.com" : "invalid-email", password: index % 2 ? "learn1234" : "short" }
    case "paginate": return Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}`, score: (i * 7 + index) % 20 }))
    case "accessible-tabs": return { tabs: ["Overview", "Files", "Settings"], activeIndex: 2, key: "ArrowRight" }
    case "parse-query": return { search: "  React hooks ", page: "2", pageSize: "100" }
    case "rate-limit": return { now: 12, windowSeconds: 10, limit: 3, requests: [{ user: "u1", at: 4 }, { user: "u1", at: 7 }, { user: "u2", at: 10 }], incoming: [{ user: "u1", at: 12 }, { user: "u1", at: 13 }] }
    case "permission-check": return { role: "editor", policy: { read: ["viewer", "editor", "admin"], update: ["editor", "admin"], delete: ["admin"] }, actions: ["read", "update", "delete", "export"] }
    case "endpoint-metrics": return { requests: [{ endpoint: "/users", duration: 30 }, { endpoint: "/jobs", duration: 50 }, { endpoint: "/users", duration: 10 }] }
    case "ttl-cache": return { now: 25, entries: [{ key: "profile", expiresAt: 40 }, { key: "jobs", expiresAt: 20 }, { key: "skills", expiresAt: 25 }] }
    case "clean-missing": return [12, null, 0, -3, null, 8]
    case "outlier-detection": return [10, 11, 10, 12, 9, 11, 100]
    case "normalize-records": return [{ name: "  Asha ", category: null }, { name: "Dev", category: " " }, { name: " Noor", category: "student" }]
    case "lru-events": return [{ op: "put", key: "a", value: 1 }, { op: "put", key: "b", value: 2 }, { op: "get", key: "a" }, { op: "put", key: "c", value: 3 }, { op: "put", key: "d", value: 4 }]
    case "deterministic-output": return [{ id: 1, name: "Zoe", score: 9 }, { id: 2, name: "Ari", score: 9 }, { id: 3, name: "Mia", score: 7 }]
    default: return scenario.example
  }
}

export function makeSuggestedTasks(role: string, level: string): SuggestedTask[] {
  const roleKey = role.toLowerCase()
  const preferred: TaskCategory = roleKey.includes("data") || roleKey.includes("machine") ? "Data" : roleKey.includes("front") ? "Frontend" : roleKey.includes("back") ? "Backend" : "DSA"
  const language: TaskLanguage = preferred === "Data" || preferred === "Backend" ? "python" : "javascript"
  return blueprints.flatMap(blueprint => scenarios[blueprint.input].map((scenario, index) => ({
    id: `${blueprint.id}-${index + 1}`,
    title: `${blueprint.title} · ${scenario.name}`,
    skill: blueprint.skill,
    level: blueprint.level,
    category: blueprint.category,
    goal: `${blueprint.goal} Practise it with ${scenario.name}.`,
    hint: blueprint.hint,
    example: JSON.stringify(exampleFor(blueprint, scenario, index)),
    language,
  }))).sort((a, b) => {
    const aRank = (a.category === preferred ? 0 : 100) + (a.level === level ? 0 : 10)
    const bRank = (b.category === preferred ? 0 : 100) + (b.level === level ? 0 : 10)
    return aRank - bRank || a.title.localeCompare(b.title)
  })
}

export const TASK_LIBRARY_SIZE = blueprints.length * textContexts.length

export function toPythonLiteral(json: string): string {
  const render = (value: unknown): string => {
    if (value === null) return "None"
    if (value === true) return "True"
    if (value === false) return "False"
    if (typeof value === "string") return JSON.stringify(value)
    if (typeof value === "number") return String(value)
    if (Array.isArray(value)) return `[${value.map(render).join(", ")}]`
    if (typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).map(([key, item]) => `${render(key)}: ${render(item)}`).join(", ")}}`
    return "None"
  }
  try { return render(JSON.parse(json)) } catch { return "None" }
}
