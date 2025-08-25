import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { v4 } from 'uuid';

export const Route = createFileRoute("/_layout/chats")({
  component: Chats,
})

function ChatsList() {
  useEffect(() => {
    // redirect to new chat page with new uuid
    const newChatId = v4()
    window.location.href = `/chat/${newChatId}`
  }, [])

  return (
    <></>
  )
}

function Chats() {
  return (
    <div className="max-w-4xl mx-auto px-4">
      <ChatsList />
    </div>
  )
}
