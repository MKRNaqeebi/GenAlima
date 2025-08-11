import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { v4 } from 'uuid';

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

function Dashboard() {

  useEffect(() => {
    // redirect to new chat page with new uuid
    const newChatId = v4()
    window.location.href = `/chat/${newChatId}`
  }, [])

  return (
    <></>
  )
}
