/* This is the tested core logic for fetching and processing. 
   To be integrated into the Extension's background/content scripts.
*/

```javascript
const JiraConfig = {
    SP_FIELD: 'customfield_10014',
    HOURS_PER_POINT: 4,
    DOMAIN: window.location.hostname,
    GEMINI_KEY: process.env.GEMINI_API_KEY
};

class JiraService {
    static async fetchJira(endpoint, method = 'GET', body = null) {
        const url = `https://${JiraConfig.DOMAIN}${endpoint}`;
        const options = {
            method,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Atlassian-Token': 'no-check'
            }
        };
        if (body) options.body = JSON.stringify(body);
        const res = await fetch(url, options);
        return res.json();
    }

    static async getMyId() {
        const user = await this.fetchJira('/rest/api/3/myself');
        return user.accountId;
    }

    static async searchJql(jql, fields = []) {
        return this.fetchJira('/rest/api/3/search/jql', 'POST', {
            jql,
            fields,
            maxResults: 50
        });
    }
}

class DateHelper {
    static getTargetDate(baseDate = new Date()) {
        let target = new Date(baseDate);
        const day = target.getDay();

        // Logic giữ nguyên: 
        // Thứ 2 (1) lùi 3 ngày -> Thứ 6
        // Chủ Nhật (0) lùi 2 ngày -> Thứ 6
        if (day === 1) target.setDate(target.getDate() - 3);
        else if (day === 0) target.setDate(target.getDate() - 2);
        else target.setDate(target.getDate() - 1);

        // FIX: Không dùng toISOString() nữa. 
        // Dùng phương pháp thủ công để giữ đúng ngày ở múi giờ hiện tại (Local Time)
        const yyyy = target.getFullYear();
        const mm = String(target.getMonth() + 1).padStart(2, '0'); // Tháng chạy từ 0-11
        const dd = String(target.getDate()).padStart(2, '0');
        
        return `${yyyy}-${mm}-${dd}`;
    }
}

class ReportEngine {
    constructor(myId, targetDate, baseDate) {
        this.myId = myId;
        this.targetDate = targetDate;
        this.baseDate = baseDate; // Lưu lại baseDate để tính mốc 14 ngày
        this.report = {
            "Done Yesterday": [],
            "Progress Changed": [],
            "Plan for Today": []
        };
    }

    // Hàm phụ để tính toán Progress Change (giữ nguyên logic 1 SP = 4h)
    calculateProgress(issue, secondsOnTarget) {
        const f = issue.fields;
        const sp = f[JiraConfig.SP_FIELD] || 0;
        const goal = sp * JiraConfig.HOURS_PER_POINT;
        if (goal === 0) return "N/A";

        const totalSpent = (f.timetracking.timeSpentSeconds || 0) / 3600;
        const current = (totalSpent / goal) * 100;
        const prev = ((totalSpent - (secondsOnTarget / 3600)) / goal) * 100;
        return `${Math.round(prev)}% ➔ ${Math.round(current)}%`;
    }

    async generate() {
        const twoWeeksAgo = new Date(this.baseDate);
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];

        // Fetch thêm field "parent"
        const fields = ["summary", "status", "worklog", "timetracking", "parent", JiraConfig.SP_FIELD];

        const logData = await JiraService.searchJql(`worklogAuthor = currentUser() AND worklogDate = "${this.targetDate}"`, fields);
        const planData = await JiraService.searchJql(`assignee = currentUser() AND sprint in openSprints() AND status in ("In Progress", "In Review", "QA FAILED") AND created >= "${twoWeeksAgoStr}"`, fields);

        const loggedIssueKeys = new Set();

        // Helper lấy tên Parent
        const getParentSummary = (issue) => {
            return issue.fields.parent ? issue.fields.parent.fields.summary : "General Tasks";
        };

        logData.issues.forEach(issue => {
            loggedIssueKeys.add(issue.key);
            const myLogs = issue.fields.worklog.worklogs.filter(l => l.author.accountId === this.myId);
            const targetLogs = myLogs.filter(l => l.started.startsWith(this.targetDate));
            const hasLoggedBefore = myLogs.some(l => l.started.split('T')[0] < this.targetDate);
            
            const secondsToday = targetLogs.reduce((acc, l) => acc + l.timeSpentSeconds, 0);
            const category = hasLoggedBefore ? "Progress Changed" : "Done Yesterday";

            this.report[category].push({
                TaskLink: `https://${JiraConfig.DOMAIN}/browse/${issue.key}`,
                Title: issue.fields.summary,
                ParentSummary: getParentSummary(issue), // Chỉ lấy text
                Time: (secondsToday / 3600).toFixed(2) + 'h',
                Progress: this.calculateProgress(issue, secondsToday),
                Status: issue.fields.status.name
            });
        });

        planData.issues.forEach(issue => {
            if (!loggedIssueKeys.has(issue.key)) {
                this.report["Plan for Today"].push({
                    TaskLink: `https://${JiraConfig.DOMAIN}/browse/${issue.key}`,
                    Title: issue.fields.summary,
                    ParentSummary: getParentSummary(issue), // Chỉ lấy text
                    Status: issue.fields.status.name,
                    SP: issue.fields[JiraConfig.SP_FIELD] || 0
                });
            }
        });

        return this.report;
    }
}

class GeminiService {
    static async generateReport(jsonData) {
        const modelName = 'gemini-2.5-flash-lite';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${JiraConfig.GEMINI_KEY}`;
        
        // Đây chính là "linh hồn" của Gem mà bạn đã viết
        const systemInstruction = `
            📌 Role & Context
You are a Senior Backend Developer Assistant. Your primary goal is to transform raw Jira worklog data (JSON or lists) into a professional, highly structured Daily Report for the Backend team on the Core project. The output is specifically designed for Slack communication.

📋 Output Format (STRICT ADHERENCE REQUIRED)
You MUST follow this exact template and character styling:

DAILY REPORT — [Date, e.g., 4 Apr 2026]
Name: Nhat Huy
Platform: Backend

——————————————————
DONE YESTERDAY
[ParentSummary]
  • [Task Link]: [Task Title]
    ◦ Progress: 100% (or X%)
    ◦ Remaining: [If < 100%, describe specific remaining actions]

PROGRESS CHANGED
[ParentSummary]
  • [Task Link]: [Task Title]
    ◦ Progress: X% → Y%
    ◦ Reason: [Brief technical summary of work done based on logs]

PLAN FOR TODAY
[ParentSummary]
  • [Task Link]: [Task Title]
    ◦ Progress: X% by EOD | Full task done: [Estimated completion date]
    ◦ AI: [Describe AI usage, e.g., "Write solution design, generate code, review code"]

Blocker: None (or describe blockers)
At-risk: None (or describe risks)
Question: None (or describe questions)

🧠 Data Processing Logic
When receiving data, categorize issues based on these rules:

Jira Links: Always format links as https://everfit.atlassian.net/browse/[KEY].

DONE YESTERDAY: - Use for tasks that reached 100% progress OR tasks that had significant worklogs yesterday.

If Progress < 100%, the Remaining field is Mandatory (e.g., "Wait for QA testing", "Resolve code review comments").

PROGRESS CHANGED: - Use for ongoing tasks that showed a percentage increase yesterday.

Reason must be written in professional technical English (e.g., "Implemented base logic for API", "Optimized database queries", "Fixed staging bugs").

PLAN FOR TODAY: - Use for tasks currently in "In Progress", "In Review", or "QA FAILED" status that were not completed yesterday.

AI field: Automatically suggest actions like: "Solution design, implementation plan, generate code, review code".

Grouping: Always group multiple sub-tasks under their respective Parent/Epic item to avoid redundancy.

✍️ Tone & Style
Professional, concise, and action-oriented.

Use technical terminology appropriate for a Senior Backend Developer.

Use specific symbols: 🎉 for Done, 🚀 for Progress, 📅 for Plan.
        `;

        const prompt = `Please generate a Daily Report based on this JSON data: ${JSON.stringify(jsonData)}`;

        const body = {
            system_instruction: {
                parts: [{ text: systemInstruction }]
            },
            contents: [
                {
                    parts: [{ text: prompt }]
                }
            ],
            generationConfig: {
                temperature: 0.1, // Để kết quả ổn định, không quá sáng tạo
                topP: 0.8,
                topK: 40
            }
        };

try {
            console.log("📡 Sending request to Gemini...");
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await response.json();

            // --- ĐÂY LÀ ĐOẠN TÔI ĐÃ THÊM ĐỂ SOI LỖI ---
            if (data.error) {
                console.error("❌ Google API Error:", data.error.message);
                console.dir(data.error); // In ra object lỗi để bạn click vào xem chi tiết
                return `API Error: ${data.error.message}`;
            }

            if (!data.candidates || data.candidates.length === 0) {
                console.error("⚠️ No candidates returned. Check 'Safety Filters' or 'Prompt Violation'.");
                console.dir(data); // Soi xem Google có báo là "HARM_CATEGORY" không
                return "AI Safety Blocked or Empty Response";
            }
            // ------------------------------------------

            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error("❌ Connection/Network Error:", error);
            return "Connection Error.";
        }
    }
}

async function runDailyTool() {
    console.log("⏳ Step 1: Fetching data from Jira...");
    const myId = await JiraService.getMyId();
    const baseDate = new Date(); 
    const targetDate = DateHelper.getTargetDate(baseDate);
    
    const engine = new ReportEngine(myId, targetDate, baseDate); 
    const finalReport = await engine.generate();
    console.log("✅ Data fetched and processed. Raw report:");
    console.dir(finalReport, { depth: null });

    console.log("⏳ Step 2: Sending to Gemini AI for formatting...");
    const slackReport = await GeminiService.generateReport(finalReport);

    console.log(`%c🚀 FINAL SLACK REPORT - ${targetDate}`, "color: #00ff00; font-size: 20px; font-weight: bold;");
    console.log("--------------------------------------------------");
    console.log(slackReport);
    console.log("--------------------------------------------------");
}

runDailyTool();
```