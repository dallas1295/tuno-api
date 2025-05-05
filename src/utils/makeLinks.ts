export function makeUserLink(
  id: string,
  action:
    | "self"
    | "update"
    | "delete"
    | "changeEmail"
    | "changePassword"
    | "changeUsername",
) {
  switch (action) {
    case "self":
      return { href: `/users/${id}/profile`, method: "GET" };
    case "update":
      return { href: `/users/${id}`, method: "PUT" };
    case "delete":
      return { href: `/users/${id}`, method: "DELETE" };
    case "changeEmail":
      return { href: `/users/${id}/email`, method: "PATCH" };
    case "changePassword":
      return { href: `/users/${id}/password`, method: "PATCH" };
    case "changeUsername":
      return { href: `/users/${id}/username`, method: "PATCH" };
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

export function makeNoteLink(id: string, action: "self" | "update" | "delete") {
  const base = `/note/${id}`;
  switch (action) {
    case "self":
      return { href: base, method: "GET" };
    case "update":
      return { href: base, method: "PUT" };
    case "delete":
      return { href: base, method: "DELETE" };
  }
}

export function makeTodoLink(id: string, action: "self" | "update" | "delete") {
  const base = `/todo/${id}`;
  switch (action) {
    case "self":
      return { href: base, method: "GET" };
    case "update":
      return { href: base, method: "PUT" };
    case "delete":
      return { href: base, method: "DELETE" };
  }
}
