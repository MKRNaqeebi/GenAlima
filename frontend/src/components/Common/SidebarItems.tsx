import { Link, useRouterState } from "@tanstack/react-router"
import { FiBox, FiCode } from "react-icons/fi"

interface SidebarItemsProps {
  onClose?: () => void
  isCollapsed?: boolean
}

const menuItems = [
  { icon: FiCode, label: "Workflows", path: "/workflows" },
  { icon: FiBox, label: "Components", path: "/components" },
]

const SidebarItems = ({ onClose, isCollapsed = false }: SidebarItemsProps) => {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  return (
    <div className="flex flex-col space-y-0 h-full">
      {/* Top Menu Items */}
      <div className={`flex flex-col space-y-0.5 ${isCollapsed ? 'px-1' : 'px-2'} py-2`}>
        {menuItems.map((item) => {
          const isActive =
            currentPath === item.path ||
            (item.path === "/workflows" && currentPath.startsWith("/workflow/"))

          return (
            <Link
              key={item.label}
              to={item.path}
              className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-start px-3'} py-2.5 rounded-md text-sm transition-all duration-150 hover:no-underline ${
                isActive
                  ? 'bg-gray-200 dark:bg-app-hover text-gray-900 dark:text-app-text-primary font-medium'
                  : 'text-gray-700 dark:text-app-text-secondary hover:bg-gray-100 dark:hover:bg-app-hover hover:text-gray-900 dark:hover:text-app-text-primary'
              }`}
              onClick={onClose}
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon className={`w-4 h-4 ${
                isActive
                  ? 'text-gray-900 dark:text-app-text-primary'
                  : 'text-gray-600 dark:text-app-text-muted'
              }`}
              />
              {!isCollapsed && <span className="ml-3">{item.label}</span>}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default SidebarItems
