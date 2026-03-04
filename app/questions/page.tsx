"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { decodeQuestionPrompt } from "@/lib/checkin-questions";

type QuestionType = "short_answer" | "multiple_choice" | "single_choice" | "likert" | "ranking";

type Question = {
  id: string;
  key?: string;
  prompt: string;
  type: string;
  required: boolean;
  isDefault?: boolean;
};

type BankQuestion = {
  prompt: string;
  type: QuestionType;
};

const QUESTION_BANK: BankQuestion[] = [
  { prompt: "What should the team stop doing because it is counterproductive?", type: "short_answer" },
  { prompt: "What would you change about our product, our team, or anything work-related if you had a magic wand?", type: "short_answer" },
  { prompt: "Is there a project or task where you are interested in taking more ownership?", type: "short_answer" },
  { prompt: "Are you crystal clear on your role and what you should be working on?", type: "short_answer" },
  { prompt: "What is the biggest bottleneck to your productivity right now?", type: "short_answer" },
  { prompt: "What are your top three strengths and how did you apply them to your work since your last review?", type: "short_answer" },
  { prompt: "What are up to three wins you are proud of from the past month?", type: "short_answer" },
  { prompt: "What are up to three opportunities for growth to focus on in the next 6-12 months?", type: "short_answer" },
  { prompt: "What next steps do you want to take to grow in your role?", type: "short_answer" },
  { prompt: "Are you getting enough support from your manager to succeed?", type: "short_answer" },
  { prompt: "Do you have the tools you need to perform your job?", type: "short_answer" },
  { prompt: "How would you rate your current workload?", type: "likert" },
  { prompt: "What is one thing I can do to better support you?", type: "short_answer" }
];

function createQuestionKey(prompt: string) {
  const base = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 26);
  const suffix = Date.now().toString(36).slice(-6);
  return `custom_${base}_${suffix}`;
}

export default function QuestionsPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;

  const [questionPrompt, setQuestionPrompt] = useState("");
  const [questionType, setQuestionType] = useState<QuestionType>("short_answer");
  const [questionOptions, setQuestionOptions] = useState("");
  const [rankMax, setRankMax] = useState(5);
  const [questionMessage, setQuestionMessage] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedBankPrompts, setSelectedBankPrompts] = useState<string[]>([]);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editType, setEditType] = useState<QuestionType>("short_answer");
  const [editOptions, setEditOptions] = useState("");
  const [editRankMax, setEditRankMax] = useState(5);

  const loadQuestions = async () => {
    setQuestionMessage(null);
    const res = await fetch("/api/checkin-template");
    const body = await res.json();
    if (res.ok) {
      setQuestions(body);
      return;
    }
    setQuestionMessage(body.error ?? "Failed to load questions.");
  };

  const addQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuestionMessage(null);

    const key = createQuestionKey(questionPrompt);
    const options = questionType === "multiple_choice" || questionType === "single_choice"
      ? questionOptions.split(",").map((opt) => opt.trim()).filter(Boolean)
      : undefined;

    const res = await fetch("/api/checkin-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        prompt: questionPrompt,
        type: questionType,
        required: false,
        options,
        rankMax: questionType === "ranking" ? rankMax : undefined
      })
    });
    const body = await res.json();
    if (!res.ok) {
      setQuestionMessage(body.error ?? "Failed to add check-in question.");
      return;
    }

    setQuestionPrompt("");
    setQuestionOptions("");
    setQuestionMessage("Check-in question added.");
    await loadQuestions();
  };

  const addSelectedBankQuestions = async () => {
    setQuestionMessage(null);
    if (selectedBankPrompts.length === 0) {
      setQuestionMessage("Select at least one question.");
      return;
    }

    const selected = QUESTION_BANK.filter((q) => selectedBankPrompts.includes(q.prompt));
    const results = await Promise.all(
      selected.map(async (question) => {
        const res = await fetch("/api/checkin-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: createQuestionKey(question.prompt),
            prompt: question.prompt,
            type: question.type,
            required: false
          })
        });
        return res.ok;
      })
    );

    const successCount = results.filter(Boolean).length;
    if (successCount === 0) {
      setQuestionMessage("Failed to add selected questions.");
      return;
    }
    setSelectedBankPrompts([]);
    setQuestionMessage(`Added ${successCount} question${successCount === 1 ? "" : "s"} from bank.`);
    await loadQuestions();
  };

  const startEditing = (question: Question) => {
    const decoded = decodeQuestionPrompt(question.prompt);
    setEditingQuestionId(question.id);
    setEditPrompt(decoded.prompt);
    setEditType((decoded.meta.type as QuestionType | undefined) ?? "short_answer");
    setEditOptions((decoded.meta.options ?? []).join(", "));
    setEditRankMax(decoded.meta.rankMax ?? 5);
  };

  const saveEdit = async (questionId: string) => {
    setQuestionMessage(null);
    const options = editType === "multiple_choice" || editType === "single_choice"
      ? editOptions.split(",").map((opt) => opt.trim()).filter(Boolean)
      : undefined;

    const res = await fetch(`/api/checkin-template/${questionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: editPrompt,
        type: editType,
        required: false,
        options,
        rankMax: editType === "ranking" ? editRankMax : undefined
      })
    });
    const body = await res.json();
    if (!res.ok) {
      setQuestionMessage(body.error ?? "Failed to update question.");
      return;
    }
    setEditingQuestionId(null);
    setQuestionMessage("Question updated.");
    await loadQuestions();
  };

  const deleteQuestion = async (questionId: string) => {
    setQuestionMessage(null);
    const res = await fetch(`/api/checkin-template/${questionId}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) {
      setQuestionMessage(body.error ?? "Failed to delete question.");
      return;
    }
    if (editingQuestionId === questionId) {
      setEditingQuestionId(null);
    }
    setQuestionMessage("Question deleted.");
    await loadQuestions();
  };

  useEffect(() => {
    loadQuestions().catch(() => setQuestionMessage("Failed to load questions."));
  }, []);

  return (
    <div className="page-shell narrow">
      <section className="card">
        <div className="section-head">
          <h1>Check-in Questions</h1>
          <p className="small">Managers can update custom weekly check-in questions here.</p>
        </div>
      </section>

      {status !== "loading" && role !== Role.MANAGER && (
        <section className="card">
          <p className="small">Only managers can manage check-in questions.</p>
        </section>
      )}

      {status !== "loading" && role !== Role.MANAGER ? null : (
        <>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Add Question</h2>
            <form onSubmit={addQuestion} className="grid" style={{ gap: "0.7rem" }}>
              <label>
                Question prompt
                <input required value={questionPrompt} onChange={(e) => setQuestionPrompt(e.target.value)} />
              </label>
              <label>
                Format
                <select
                  value={questionType}
                  onChange={(e) => setQuestionType(e.target.value as QuestionType)}
                >
                  <option value="short_answer">Short answer</option>
                  <option value="single_choice">Single choice</option>
                  <option value="multiple_choice">Multiple choice</option>
                  <option value="likert">Likert scale (1-5)</option>
                  <option value="ranking">Ranking</option>
                </select>
              </label>
              {(questionType === "single_choice" || questionType === "multiple_choice") && (
                <label>
                  Choices (comma-separated)
                  <input
                    value={questionOptions}
                    onChange={(e) => setQuestionOptions(e.target.value)}
                    placeholder="Option A, Option B, Option C"
                  />
                </label>
              )}
              {questionType === "ranking" && (
                <label>
                  Max rank
                  <input type="number" min={2} max={10} value={rankMax} onChange={(e) => setRankMax(Number(e.target.value))} />
                </label>
              )}
              <button type="submit">Add Question</button>
            </form>
            {questionMessage && <p className="small">{questionMessage}</p>}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Current Questions</h2>
            <button type="button" onClick={() => loadQuestions().catch(() => setQuestionMessage("Failed to load questions."))} style={{ marginBottom: "0.6rem" }}>
              Refresh Questions
            </button>
            <div className="grid" style={{ gap: "0.5rem" }}>
              {questions.map((q) => {
                const decoded = decodeQuestionPrompt(q.prompt);
                const isEditing = editingQuestionId === q.id;
                const isDefault = Boolean(q.isDefault);
                return (
                  <div key={q.id} className="card" style={{ padding: "0.6rem" }}>
                    {isEditing ? (
                      <div className="grid" style={{ gap: "0.55rem" }}>
                        <label>
                          Question prompt
                          <input value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} />
                        </label>
                        <label>
                          Format
                          <select value={editType} onChange={(e) => setEditType(e.target.value as QuestionType)}>
                            <option value="short_answer">Short answer</option>
                            <option value="single_choice">Single choice</option>
                            <option value="multiple_choice">Multiple choice</option>
                            <option value="likert">Likert scale (1-5)</option>
                            <option value="ranking">Ranking</option>
                          </select>
                        </label>
                        {(editType === "single_choice" || editType === "multiple_choice") && (
                          <label>
                            Choices (comma-separated)
                            <input
                              value={editOptions}
                              onChange={(e) => setEditOptions(e.target.value)}
                              placeholder="Option A, Option B, Option C"
                            />
                          </label>
                        )}
                        {editType === "ranking" && (
                          <label>
                            Max rank
                            <input
                              type="number"
                              min={2}
                              max={10}
                              value={editRankMax}
                              onChange={(e) => setEditRankMax(Number(e.target.value))}
                            />
                          </label>
                        )}
                        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                          <button type="button" onClick={() => saveEdit(q.id)}>Save</button>
                          <button type="button" onClick={() => setEditingQuestionId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <strong>{decoded.prompt}</strong>
                        <p className="small" style={{ margin: 0 }}>{decoded.meta.type ?? q.type}</p>
                        <div style={{ display: "flex", gap: "0.45rem", marginTop: "0.45rem", flexWrap: "wrap" }}>
                          {isDefault ? (
                            <span className="small">Default question</span>
                          ) : (
                            <>
                              <button type="button" onClick={() => startEditing(q)}>Edit</button>
                              <button
                                type="button"
                                onClick={() => deleteQuestion(q.id)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {questions.length === 0 && <p className="small">No custom questions yet.</p>}
            </div>
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Question Bank</h2>
            <p className="small">Select any question below to add it to the active weekly check-in template.</p>
            <div className="grid" style={{ gap: "0.5rem" }}>
              {QUESTION_BANK.map((q) => (
                <button
                  key={q.prompt}
                  type="button"
                  className={`question-bank-option${selectedBankPrompts.includes(q.prompt) ? " selected" : ""}`}
                  aria-pressed={selectedBankPrompts.includes(q.prompt)}
                  onClick={() => {
                    if (selectedBankPrompts.includes(q.prompt)) {
                      setSelectedBankPrompts(selectedBankPrompts.filter((prompt) => prompt !== q.prompt));
                      return;
                    }
                    setSelectedBankPrompts([...selectedBankPrompts, q.prompt]);
                  }}
                >
                  <strong>{q.prompt}</strong>
                </button>
              ))}
            </div>
            <div style={{ marginTop: "0.65rem" }}>
              <button type="button" onClick={addSelectedBankQuestions}>Add Selected to Check-in</button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
