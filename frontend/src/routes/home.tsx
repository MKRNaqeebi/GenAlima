import { createFileRoute, redirect } from "@tanstack/react-router"
import HomePage from "../components/HomePage/HomePage"
import { isLoggedIn } from "../hooks/useAuth"

export const Route = createFileRoute("/home")({
  component: HomePage,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})