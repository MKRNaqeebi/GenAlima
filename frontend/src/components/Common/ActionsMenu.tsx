import {
  Button,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  useDisclosure,
} from "@chakra-ui/react"
import { BsThreeDotsVertical } from "react-icons/bs"
import { FiEdit, FiTrash } from "react-icons/fi"

import type { ItemPublic, UserPublic, TemplatePublic, ConnectorPublic, ChatPublic, MessagePublic, KnowledgePublic } from "../../client"
import EditUser from "../Admin/EditUser"
import EditItem from "../Items/EditItem"
import EditTemplate from "../Templates/EditTemplate"
import EditChat from "../Chats/EditChat"
import EditMessage from "../Messages/EditMessage"
import EditConnector from "../Connectors/EditConnector"
import EditKnowledge from "../Knowledges/EditKnowledge"
import Delete from "./DeleteAlert"

interface ActionsMenuProps {
  type: string
  value: ItemPublic | UserPublic | TemplatePublic | ConnectorPublic | ChatPublic | MessagePublic | KnowledgePublic
  disabled?: boolean
}

const ActionsMenu = ({ type, value, disabled }: ActionsMenuProps) => {
  const editUserModal = useDisclosure()
  const deleteModal = useDisclosure()

  return (
    <>
      <Menu>
        <MenuButton
          isDisabled={disabled}
          as={Button}
          rightIcon={<BsThreeDotsVertical />}
          variant="unstyled"
        />
        <MenuList>
          <MenuItem
            onClick={editUserModal.onOpen}
            icon={<FiEdit fontSize="16px" />}
          >
            Edit {type}
          </MenuItem>
          <MenuItem
            onClick={deleteModal.onOpen}
            icon={<FiTrash fontSize="16px" />}
            color="ui.danger"
          >
            Delete {type}
          </MenuItem>
        </MenuList>
        {type === "User" ? (
          <EditUser
            user={value as UserPublic}
            isOpen={editUserModal.isOpen}
            onClose={editUserModal.onClose}
          />
        ) : type === "Connector" ? (
          <EditConnector
            connector={value as ConnectorPublic}
            isOpen={editUserModal.isOpen}
            onClose={editUserModal.onClose}
          />
        ) : type === "Chat" ? (
          <EditChat
            chat={value as ChatPublic}
            isOpen={editUserModal.isOpen}
            onClose={editUserModal.onClose}
          />
        ) : type === "Message" ? (
          <EditMessage
            message={value as MessagePublic}
            isOpen={editUserModal.isOpen}
            onClose={editUserModal.onClose}
          />
        ) : type === "Knowledge" ? (
          <EditKnowledge
            knowledge={value as KnowledgePublic}
            isOpen={editUserModal.isOpen}
            onClose={editUserModal.onClose}
          />
        ) : type === "Template" ? (
          <EditTemplate
            template={value as TemplatePublic}
            isOpen={editUserModal.isOpen}
            onClose={editUserModal.onClose}
          />
        ) : (
          <EditItem
            item={value as ItemPublic}
            isOpen={editUserModal.isOpen}
            onClose={editUserModal.onClose}
          />
        )}
        <Delete
          type={type}
          id={value.id}
          isOpen={deleteModal.isOpen}
          onClose={deleteModal.onClose}
        />
      </Menu>
    </>
  )
}

export default ActionsMenu
