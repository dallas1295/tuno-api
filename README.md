# Tuno API

_Secure Note-taking API_

---

## Notes

- **Create Note**

  - Endpoint: `/api/:userId/notes/create`
  - Validates note name, content, tags, and user
  - Supports tags and pinning on creation

- **Read Notes**

  - Get all notes (paginated, filtered by tags, sorted): `/api/:userId/notes`
  - Get single note: `/api/:userId/note/:id`
  - Search notes (query, tags, sort, pagination): `/notes/search`
  - Get note names: `/api/:userId/notes/names`
  - Get note tags (with count): `/api/:userId/notes/tags`
  - Get archived notes (paginated): via service/repo

- **Update Note**

  - Update note content, name, tags: `/api/:userId/note/:id/update`
  - Update pin status: `/api/:userId/note/:id/pin`
  - Update pin position: `/api/:userId/note/:id/pin/position`

- **Delete Note**

  - Delete note: `/api/:userId/note/:id/delete`
  - Prevents deleting pinned notes

- **Archive Note**

  - Archive/unarchive note (toggle): via service/repo

- **Pin/Unpin Note**

  - Pin/unpin note (toggle): `/api/:userId/note/:id/pin`
  - Update pin position among pinned notes

- **Validation & Error Handling**
  - Validates note fields, tags, and user ownership
  - Handles errors with metrics and descriptive responses

---

## Todos

- **Create Todo**

  - Endpoint: `/api/:userId/todos/create`
  - Validates todo name, tags, priority, recurring pattern, due/reminder dates

- **Read Todos**

  - Get all todos (filter by tags, completed, due date, recurring, sort): `/api/:userId/todos`
  - Get single todo: via service
  - Get todo tags: `/api/:userId/todos/tags`
  - Get todo stats: `/api/:userId/todos/stats`
  - Count todos: `/api/:userId/todos/count`

- **Update Todo**

  - Update todo fields: `/api/:userId/todos/:todoId/update`
  - Toggle completion: `/api/:userId/todo/:todoId/toggle`

- **Delete Todo**

  - Delete todo: `/api/:userId/todo/:id/delete`

- **Validation & Error Handling**
  - Validates fields, tags, priority, recurring pattern, and user ownership
  - Handles errors with metrics and descriptive responses

---

## Account/User

- **User Validation**

  - All endpoints require user authentication (token in `ctx.state.user`)
  - User ID in token must match route param
  - User existence checked via `userService.findById`

- **User-specific Data**
  - All notes and todos are scoped to the authenticated user

---

## General

- **Pagination & Sorting**

  - Supported for notes and todos (page, pageSize, sortBy, sortOrder)

- **Tag Management**

  - List tags for notes and todos, with counts

- **Stats**

  - Todo stats: total, completed, pending, priority breakdown, overdue, due today, with reminders

- **Error Handling & Metrics**
  - All endpoints track errors and HTTP/database/service metrics
