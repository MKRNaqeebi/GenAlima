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

import { TemplatesService } from "../../client"
import ActionsMenu from "../../components/Common/ActionsMenu"
import Navbar from "../../components/Common/Navbar"
import AddTemplate from "../../components/Templates/AddTemplate"
import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"

const templatesSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/templates")({
  component: Templates,
  validateSearch: (search) => templatesSearchSchema.parse(search),
})

const PER_PAGE = 5

function getTemplatesQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      TemplatesService.readTemplates({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["templates", { page }],
  }
}

function TemplatesTable() {
  const queryClient = useQueryClient()
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    navigate({ search: (prev: {[key: string]: string}) => ({ ...prev, page }) })

  const {
    data: templates,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getTemplatesQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const hasNextPage = !isPlaceholderData && templates?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getTemplatesQueryOptions({ page: page + 1 }))
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
              {templates?.data.map((template) => (
                <Tr key={template.id} opacity={isPlaceholderData ? 0.5 : 1}>
                  <Td>{template.id}</Td>
                  <Td isTruncated maxWidth="150px">
                    {template.title}
                  </Td>
                  <Td
                    color={!template.description ? "ui.dim" : "inherit"}
                    isTruncated
                    maxWidth="150px"
                  >
                    {template.description || "N/A"}
                  </Td>
                  <Td>
                    <ActionsMenu type={"Template"} value={template} />
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

function Templates() {
  return (
    <Container maxW="full">
      <Heading size="lg" textAlign={{ base: "center", md: "left" }} pt={12}>
        Templates Management
      </Heading>

      <Navbar type={"Template"} addModalAs={AddTemplate} />
      <TemplatesTable />
    </Container>
  )
}
