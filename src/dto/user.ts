import { User } from "../models/user.ts";

interface UserLink {
  href: string;
  method: string;
}

interface UserResponse {
  username: string;
  email: string;
  createdAt: Date;
  links: { [key: string]: UserLink };
}

export function toUserResponse(
  user: User,
  links: { [key: string]: UserLink },
): UserResponse {
  const response: UserResponse = {
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    links: links,
  };

  return response;
}
