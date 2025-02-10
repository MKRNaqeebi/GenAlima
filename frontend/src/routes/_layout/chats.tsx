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

import { ChatsService } from "../../client"
import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"
  
const chatsSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/chats")({
  component: Chats,
  validateSearch: (search) => chatsSearchSchema.parse(search),
})

const PER_PAGE = 5

function getChatsQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      ChatsService.readChats({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["chats", { page }],
  }
}

function ChatsTable() {
  const queryClient = useQueryClient()
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    navigate({ search: (prev: {[key: string]: string}) => ({ ...prev, page }) })

  const {
    data: chats,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getChatsQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const hasNextPage = !isPlaceholderData && chats?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getChatsQueryOptions({ page: page + 1 }))
    }
  }, [page, queryClient, hasNextPage])

  return (
    <>
      <TableContainer>
        <Table size={{ base: "sm", md: "md" }}>
          <Thead>
            <Tr>
              <Th>ID</Th>
              <Th>Title</Th>
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
              {chats?.data.map((chat) => (
                <Tr key={chat.id} opacity={isPlaceholderData ? 0.5 : 1}>
                  <Td>{chat.id}</Td>
                  <Td isTruncated maxWidth="150px">
                    {chat.title}
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

function Chats() {
  return (
    <Container maxW="full">
      <Heading size="lg" textAlign={{ base: "center", md: "left" }} pt={12}>
        Chats Management
      </Heading>
      <ChatsTable />
    </Container>
  )
}
