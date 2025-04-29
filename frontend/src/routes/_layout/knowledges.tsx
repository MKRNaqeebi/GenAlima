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

import { KnowledgePublic, KnowledgesService } from "../../client"
import AddKnowledge from "../../components/Knowledges/AddKnowledge"
import Navbar from "../../components/Common/Navbar"
import ActionsMenu from "../../components/Common/ActionsMenu"
import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"

const knowledgesSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/knowledges")({
  component: Knowledges,
  validateSearch: (search) => knowledgesSearchSchema.parse(search),
})

const PER_PAGE = 5

function getKnowledgesQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      KnowledgesService.readKnowledges({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["knowledges", { page }],
  }
}

function KnowledgesTable() {
  const queryClient = useQueryClient()
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    navigate({ search: (prev: {[key: string]: string}) => ({ ...prev, page }) })

  const {
    data: knowledges,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getKnowledgesQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const hasNextPage = !isPlaceholderData && knowledges?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getKnowledgesQueryOptions({ page: page + 1 }))
    }
  }, [page, queryClient, hasNextPage])

  return (
    <>
      <TableContainer>
        <Table size={{ base: "sm", md: "md" }}>
          <Thead>
            <Tr>
              <Th>Content</Th>
              <Th>Meta</Th>
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
              {knowledges?.data.map((knowledge: KnowledgePublic) => (
                <Tr key={knowledge.id} opacity={isPlaceholderData ? 0.5 : 1}>
                  <Td isTruncated maxWidth="300px">
                    {knowledge.content}
                  </Td>
                  <Td>{JSON.stringify(knowledge.meta)}</Td>
                  <Td>
                    <ActionsMenu type={"Knowledge"} value={knowledge} />
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

function Knowledges() {
  return (
    <Container maxW="full">
      <Heading size="lg" textAlign={{ base: "center", md: "left" }} pt={12}>
        Knowledges Management
      </Heading>
      <Navbar type={"Knowledge"} addModalAs={AddKnowledge} />
      <KnowledgesTable />
    </Container>
  )
}
