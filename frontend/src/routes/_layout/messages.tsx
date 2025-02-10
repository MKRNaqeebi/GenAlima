import {
  Container,
  Heading,
  SkeletonText,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { z } from "zod"

import { MessagesService } from "../../client"
import ActionsMenu from "../../components/Common/ActionsMenu"
import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"

const messagesSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/messages")({
  component: Messages,
  validateSearch: (search) => messagesSearchSchema.parse(search),
})

const PER_PAGE = 5

function getMessagesQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      MessagesService.readMessages({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["messages", { page }],
  }
}

function MessagesTable() {
  const queryClient = useQueryClient()
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    navigate({ search: (prev: {[key: string]: string}) => ({ ...prev, page }) })

  const {
    data: messages,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getMessagesQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const hasNextPage = !isPlaceholderData && messages?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getMessagesQueryOptions({ page: page + 1 }))
    }
  }, [page, queryClient, hasNextPage])

  return (
    <>
      <TableContainer>
        <Table size={{ base: "sm", md: "md" }}>
          <Thead>
            <Tr>
              <Th>ID</Th>
              <Th>Role</Th>
              <Th>Content</Th>
              <Th>Actions</Th>
            </Tr>
          </Thead>
          {isPending ? (
            <Tbody>
              <Tr>
                {new Array(4).fill(null).map((_, index) => (
                  <Td key={index}>
                    <SkeletonText noOfLines={1} paddingBlock="16px" />
                  </Td>
                ))}
              </Tr>
            </Tbody>
          ) : (
            <Tbody>
              {messages?.data.map((message) => (
                <Tr key={message.id} opacity={isPlaceholderData ? 0.5 : 1}>
                  <Td>{message.id}</Td>
                  <Td isTruncated maxWidth="150px">
                    {message.role}
                  </Td>
                  <Td
                    color={!message.content ? "ui.dim" : "inherit"}
                    isTruncated
                    maxWidth="150px"
                  >
                    {message.content || "N/A"}
                  </Td>
                  <Td>
                    <ActionsMenu type={"Message"} value={message} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          )}
        </Table>
      </TableContainer>
      <PaginationFooter
        page={page}
        onChangePage={setPage}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
      />
    </>
  )
}

function Messages() {
  return (
    <Container maxW="full">
      <Heading size="lg" textAlign={{ base: "center", md: "left" }} pt={12}>
        Messages Management
      </Heading>
      <MessagesTable />
    </Container>
  )
}
