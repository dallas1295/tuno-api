import { User } from "../models/user";

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

export async function toUserResponse(
  user: User,
  links: { [key: string]: UserLink },
): Promise<UserResponse> {
  const response: UserResponse = {
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    links: links,
  };

  return response;
}
