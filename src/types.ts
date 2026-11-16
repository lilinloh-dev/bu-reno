export type User = { email: string; name: string; picture?: string };

export type Home = {
  name?: string; address?: string; type?: string; area?: string; style?: string; notes?: string;
  budget?: number; floorPlanImageId?: string;
  facts?: { k: string; v: string }[];
  links?: { label: string; url: string }[];
  docs?: { imageId: string; title: string }[];
};

export type Room = { id: string; name: string; order: number };
export type IdeaStatus = "considering" | "decided" | "rejected";
export type Idea = {
  id: string; roomId: string; title: string; details?: string; motivation?: string; worries?: string; pending?: string;
  status: IdeaStatus; images: string[]; sourceUrl?: string; by?: string; createdAt: number;
};
export type Todo = { id: string; title: string; group: string; done: boolean; due?: string; assignee?: string; notes?: string; order: number; createdAt: number };
export type Expense = { id: string; item: string; category: string; roomId?: string; vendor?: string; amount: number; paid: number; date?: string; paidBy?: string; notes?: string; createdAt: number };
export type Render = {
  id: string; roomId: string; ideaIds: string[]; note?: string; prompt: string; aspect: string;
  status: "pending" | "done" | "error"; imageId?: string; error?: string; parentImageId?: string; by?: string; createdAt: number;
};
export type Suggestion = { room?: string; title?: string; details?: string; motivation?: string; worries?: string; pending?: string };
export type InboxItem = {
  id: string; url: string; platform: string; title?: string; author?: string; note?: string; images: string[];
  status: "new" | "converted" | "archived"; suggestion?: Suggestion; by?: string; createdAt: number;
};
export type Contact = { id: string; name: string; role?: string; phone?: string; email?: string; link?: string; notes?: string; createdAt: number };

export type Collections = { rooms: Room[]; ideas: Idea[]; todos: Todo[]; expenses: Expense[]; renders: Render[]; inbox: InboxItem[]; contacts: Contact[] };
export type CollectionName = keyof Collections;
export type AppState = Collections & { user: User; home: Home; ai: { ready: boolean; imageModel: string } };

export const COLLECTION_NAMES: CollectionName[] = ["rooms", "ideas", "todos", "expenses", "renders", "inbox", "contacts"];
