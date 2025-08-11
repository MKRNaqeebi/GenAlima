import {
  Container,
} from "@chakra-ui/react"
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
    <Container maxW="4xl">
      <ChatsList />
    </Container>
  )
}
