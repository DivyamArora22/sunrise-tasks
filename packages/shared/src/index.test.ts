import { describe, expect, it } from "vitest";
import { canSeeTask, isOverdue, taskInputSchema, transitionTask, type Task } from "./index";
const task: Task = { id:"1", title:"Check stock", description:"", assignedTo:"employee-1", assignedName:"Plant Head", createdBy:"admin", createdByName:"Owner", priority:"urgent", status:"new", dueDate:"2026-08-21", createdAt:"2026-08-20T10:00:00Z", updatedAt:"2026-08-20T10:00:00Z" };
describe("task workflow", () => {
  it("validates task creation", () => expect(taskInputSchema.safeParse({ title:"Check stock", description:"", assignedTo:"b13d31f7-a99f-4a14-9874-1e42b57a7b51", priority:"normal", dueDate:"2026-08-22", dueTime:"17:00" }).success).toBe(true));
  it("restricts employees to assigned tasks", () => { expect(canSeeTask("employee", "employee-1", task)).toBe(true); expect(canSeeTask("employee", "employee-2", task)).toBe(false); expect(canSeeTask("admin", "admin", task)).toBe(true); });
  it("acknowledges, starts and completes in order", () => { const a=transitionTask(task,"acknowledge"); const s=transitionTask(a,"start"); const c=transitionTask(s,"complete"); expect([a.status,s.status,c.status]).toEqual(["acknowledged","in_progress","completed"]); expect(c.completedAt).toBeTruthy(); });
  it("calculates overdue without changing status", () => { expect(isOverdue(task, new Date("2026-08-23T00:00:00Z"))).toBe(true); expect(task.status).toBe("new"); });
  it("reopens completed work", () => { const done={...task,status:"completed" as const,completedAt:"2026-08-21T12:00:00Z"}; expect(transitionTask(done,"reopen")).toMatchObject({status:"in_progress",completedAt:undefined}); });
  it("rejects invalid transitions", () => expect(() => transitionTask(task,"start")).toThrow());
});
