import { User } from "../models/user.ts";
// testing

interface UserLink {
  href: string;
  method: string;
}

export interface UserResponse {
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
