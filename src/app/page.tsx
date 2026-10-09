import { redirect } from "next/navigation";

// The app lives at /knowledge.
export default function Home() {
  redirect("/knowledge");
}
