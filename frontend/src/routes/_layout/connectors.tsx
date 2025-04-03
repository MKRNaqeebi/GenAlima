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

import { ConnectorsService } from "../../client"
import ActionsMenu from "../../components/Common/ActionsMenu"
import Navbar from "../../components/Common/Navbar"
import AddConnector from "../../components/Connectors/AddConnector"
import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"

const connectorsSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/connectors")({
  component: Connectors,
  validateSearch: (search) => connectorsSearchSchema.parse(search),
})

const PER_PAGE = 5

function getConnectorsQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      ConnectorsService.readConnectors({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["connectors", { page }],
  }
}

function ConnectorsTable() {
  const queryClient = useQueryClient()
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    navigate({ search: (prev: {[key: string]: string}) => ({ ...prev, page }) })

  const {
    data: connectors,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getConnectorsQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const hasNextPage = !isPlaceholderData && connectors?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getConnectorsQueryOptions({ page: page + 1 }))
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
              <Th>Description</Th>
              <Th>Function</Th>
              <Th>Active</Th>
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
              {connectors?.data.map((connector) => (
                <Tr key={connector.id} opacity={isPlaceholderData ? 0.5 : 1}>
                  <Td>{connector.id}</Td>
                  <Td isTruncated maxWidth="150px">
                    {connector.title}
                  </Td>
                  <Td
                    color={!connector.description ? "ui.dim" : "inherit"}
                    isTruncated
                    maxWidth="150px"
                  >
                    {connector.description || "N/A"}
                  </Td>
                  <Td>
                    <ActionsMenu type={"Connector"} value={connector} />
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

function Connectors() {
  return (
    <Container maxW="full">
      <Heading size="lg" textAlign={{ base: "center", md: "left" }} pt={12}>
        Connectors Management
      </Heading>

      <Navbar type={"Connector"} addModalAs={AddConnector} />
      <ConnectorsTable />
    </Container>
  )
}
