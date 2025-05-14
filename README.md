# Tuno API

_Secure Note-taking API_

Tuno is designed to be a personal project turned potential sass, there are many alternatives but none have the layout or necessary tradeoffs I need for my neurodivergent brain.

---

## Before 1.0 Todos

- todo/note creation/update rate limiting

## WISHLIST

**E2E**

- this is a feature that i REALLY want to implement for security and practice (need to learn more about cryptography)

**Habit Tracking/Journalling**

- I think it would be great to be able to use this (After E2E is enabled) to have a journalling section so notes don't have to be tagged and removed from sorting this would have auto dating and more of a diary focused feature set

**Secret Folder**

- I would like to implement a secret sction for extra private notes so they don't show in the search function (much like an archive feature)

**Todo & Notes Fuzzy Searching**

- this feature would be down the line, I'd like to learn how to unify the search and sorting features for a simpler front end layout

**Share capabilities**

- this would be a future feature, being able to share the users notes/todos with other tuno accounts would be a great thing for teams and companies.

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
