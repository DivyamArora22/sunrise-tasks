"use client";
import { createContext,useContext,useEffect,useState } from "react";
import { initialTasks, initialTimeline, people } from "@/lib/demo";
import { transitionTask, type Task, type TaskInput, type TimelineItem } from "@sunrise/shared";
type Ctx={tasks:Task[];people:typeof people;timeline:TimelineItem[];createTask:(v:TaskInput)=>void;act:(id:string,action:"acknowledge"|"start"|"complete"|"reopen")=>void;update:(id:string,message:string)=>void;remove:(id:string)=>void};
const Context=createContext<Ctx|null>(null);
export function AppProvider({children}:{children:React.ReactNode}){
 const [tasks,setTasks]=useState(initialTasks); const [timeline,setTimeline]=useState(initialTimeline);
 useEffect(()=>{const saved=localStorage.getItem("sunrise-demo");if(saved)try{const parsed=JSON.parse(saved);setTasks(parsed.tasks);setTimeline(parsed.timeline)}catch{}},[]);
 useEffect(()=>{localStorage.setItem("sunrise-demo",JSON.stringify({tasks,timeline}))},[tasks,timeline]);
 const history=(taskId:string,message:string,kind:"event"|"update"="event")=>setTimeline(x=>[...x,{id:crypto.randomUUID(),taskId,authorName:"Vikram Mehta",kind,message,createdAt:new Date().toISOString()}]);
 const createTask=(v:TaskInput)=>{const person=people.find(p=>p.id===v.assignedTo)!;const now=new Date().toISOString();const id=`ST-${1051+tasks.length}`;setTasks(x=>[{...v,dueTime:v.dueTime||undefined,id,assignedName:person.fullName,createdBy:people[0]!.id,createdByName:people[0]!.fullName,status:"new",createdAt:now,updatedAt:now},...x]);history(id,`Task created and assigned to ${person.fullName}`)};
 const act=(id:string,action:"acknowledge"|"start"|"complete"|"reopen")=>{setTasks(x=>x.map(t=>t.id===id?transitionTask(t,action):t));history(id,{acknowledge:"Acknowledged the task",start:"Started working",complete:"Marked the task complete",reopen:"Reopened the task"}[action])};
 const update=(id:string,message:string)=>{const now=new Date().toISOString();setTasks(x=>x.map(t=>t.id===id?{...t,latestUpdate:message,updatedAt:now}:t));history(id,message,"update")};
 return <Context.Provider value={{tasks,people,timeline,createTask,act,update,remove:id=>{setTasks(x=>x.filter(t=>t.id!==id));history(id,"Task archived")}}}>{children}</Context.Provider>
}
export const useApp=()=>{const c=useContext(Context);if(!c)throw new Error("AppProvider missing");return c};
