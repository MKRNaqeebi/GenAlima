import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

function Dashboard() {

  useEffect(() => {
    // The dashboard is the workflow list; the chat pages were removed along with
    // the chat/message/template/connector models.
    window.location.href = "/workflows"
  }, [])

  return (
    <></>
  )
}
