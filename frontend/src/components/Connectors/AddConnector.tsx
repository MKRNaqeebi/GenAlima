import {
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  Textarea,
  Checkbox,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"

import { type ApiError, type ConnectorCreate, ConnectorsService } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"
import { handleError } from "../../utils"

interface AddConnectorProps {
  isOpen: boolean
  onClose: () => void
}

const AddConnector = ({ isOpen, onClose }: AddConnectorProps) => {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ConnectorCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      title: "",
      description: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: ConnectorCreate) =>
      ConnectorsService.createConnector({ requestBody: data }),
    onSuccess: () => {
      showToast("Success!", "Connector created successfully.", "success")
      reset()
      onClose()
    },
    onError: (err: ApiError) => {
      handleError(err, showToast)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["connectors"] })
    },
  })

  const onSubmit: SubmitHandler<ConnectorCreate> = (data) => {
    mutation.mutate(data)
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size={{ base: "sm", md: "md" }}
        isCentered
      >
        <ModalOverlay />
        <ModalContent as="form" onSubmit={handleSubmit(onSubmit)}>
          <ModalHeader>Add Connector</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <FormControl isRequired isInvalid={!!errors.title}>
              <FormLabel htmlFor="title">Title</FormLabel>
              <Input
                id="title"
                {...register("title", {
                  required: "Title is required.",
                })}
                placeholder="Title"
                type="text"
              />
              {errors.title && (
                <FormErrorMessage>{errors.title.message}</FormErrorMessage>
              )}
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="description">Description</FormLabel>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="Description"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="function">Function</FormLabel>
              <Textarea
                id="function"
                {...register("function")}
                placeholder="Function"
              />
            </FormControl>
            <FormControl mt={4}>
              <Checkbox
                id="active"
                {...register("active")}
                type="checkbox"
              />
              <FormLabel htmlFor="active">Active</FormLabel>
            </FormControl>
          </ModalBody>

          <ModalFooter gap={3}>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              Save
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

export default AddConnector
