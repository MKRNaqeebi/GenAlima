import { useState } from "react"

const Appearance = () => {
  const [colorMode, setColorMode] = useState('light')

  const toggleColorMode = (value: string) => {
    setColorMode(value)
    // TODO: Implement actual theme switching
  }

  return (
    <div className="max-w-full mx-auto">
      <h2 className="text-sm font-medium py-4">
        Appearance
      </h2>
      <div className="space-y-3">
        {/* TODO: Add system default option */}
        <label className="flex items-center space-x-3">
          <input
            type="radio"
            name="colorMode"
            value="light"
            checked={colorMode === 'light'}
            onChange={() => toggleColorMode('light')}
            className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300"
          />
          <span className="text-gray-900">
            Light Mode
            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
              Default
            </span>
          </span>
        </label>
        <label className="flex items-center space-x-3">
          <input
            type="radio"
            name="colorMode"
            value="dark"
            checked={colorMode === 'dark'}
            onChange={() => toggleColorMode('dark')}
            className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300"
          />
          <span className="text-gray-900">Dark Mode</span>
        </label>
      </div>
    </div>
  )
}
export default Appearance
