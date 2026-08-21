import { z } from "zod";

export const priorities = ["normal", "high", "urgent"] as const;
export const statuses = ["new", "acknowledged", "in_progress", "completed"] as const;
export type Priority = (typeof priorities)[number];
export type TaskStatus = (typeof statuses)[number];
export type Role = "admin" | "employee";

export interface Profile { id: string; fullName: string; email: string; role: Role; department: string; active: boolean }
export interface Task {
  id: string; title: string; description: string; assignedTo: string; assignedName: string;
  createdBy: string; createdByName: string; priority: Priority; status: TaskStatus;
  dueDate: string; dueTime?: string; acknowledgedAt?: string; startedAt?: string;
  completedAt?: string; latestUpdate?: string; createdAt: string; updatedAt: string;
}
export interface TimelineItem { id: string; taskId: string; authorName: string; kind: "event" | "update"; message: string; createdAt: string }

export const taskInputSchema = z.object({
  title: z.string().trim().min(2, "Enter a task title").max(160),
  description: z.string().trim().max(3000).default(""),
  assignedTo: z.string().uuid("Choose an employee"),
  priority: z.enum(priorities).default("normal"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date"),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal(""))
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export function dueAt(task: Pick<Task, "dueDate" | "dueTime">): Date {
  return new Date(`${task.dueDate}T${task.dueTime || "23:59"}:00+05:30`);
}
export function isOverdue(task: Pick<Task, "dueDate" | "dueTime" | "status">, now = new Date()): boolean {
  return task.status !== "completed" && now.getTime() > dueAt(task).getTime();
}
export function canSeeTask(role: Role, userId: string, task: Pick<Task, "assignedTo">): boolean {
  return role === "admin" || task.assignedTo === userId;
}
export function transitionTask(task: Task, action: "acknowledge" | "start" | "complete" | "reopen", now = new Date()): Task {
  const stamp = now.toISOString();
  if (action === "acknowledge" && task.status === "new") return { ...task, status: "acknowledged", acknowledgedAt: stamp, updatedAt: stamp };
  if (action === "start" && task.status === "acknowledged") return { ...task, status: "in_progress", startedAt: stamp, updatedAt: stamp };
  if (action === "complete" && task.status !== "completed") return { ...task, status: "completed", completedAt: stamp, updatedAt: stamp };
  if (action === "reopen" && task.status === "completed") return { ...task, status: "in_progress", completedAt: undefined, updatedAt: stamp };
  throw new Error(`Cannot ${action} a ${task.status} task`);
}
export const formatDateTime = (value: string | Date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
export const statusLabel = (status: TaskStatus) => ({ new: "New", acknowledged: "Acknowledged", in_progress: "In progress", completed: "Completed" })[status];
