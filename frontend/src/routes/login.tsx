import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons"
import {
  Button,
  Container,
  FormControl,
  FormErrorMessage,
  Icon,
  Image,
  Input,
  InputGroup,
  InputRightElement,
  Link,
  Text,
  useBoolean,
  useColorModeValue,
  Box,
  VStack,
} from "@chakra-ui/react"
import {
  Link as RouterLink,
  createFileRoute,
  redirect,
} from "@tanstack/react-router"
import { type SubmitHandler, useForm } from "react-hook-form"

import Logo from "/assets/images/genalima-logo.png"
import type { Body_login_login_access_token as AccessToken } from "../client"
import useAuth, { isLoggedIn } from "../hooks/useAuth"
import { emailPattern } from "../utils"

export const Route = createFileRoute("/login")({
  component: Login,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

function Login() {
  const [show, setShow] = useBoolean()
  const { loginMutation, error, resetError } = useAuth()
  
  const isDark = useColorModeValue(false, true)
  const bgColor = isDark ? "#1a1a1a" : "#ffffff"
  const textColor = isDark ? "#e3e3e3" : "#2e2e2e"
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "#e5e5e5"
  const inputBg = isDark ? "#2b2b2b" : "#f7f7f7"
  const placeholderColor = isDark ? "#8e8e8e" : "#9ca3af"
  const cardBg = isDark ? "#2b2b2b" : "#ffffff"
  const cardShadow = isDark ? "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.1)" : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AccessToken>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      username: "",
      password: "",
    },
  })

  const onSubmit: SubmitHandler<AccessToken> = async (data) => {
    if (loginMutation.isPending) return

    resetError()

    try {
      await loginMutation.mutateAsync(data)
    } catch {
      // error is handled by useAuth hook
    }
  }

  return (
    <Box minH="100vh" bg={bgColor} display="flex" alignItems="center" justifyContent="center" px={4}>
      <Container maxW="sm" p={0}>
        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          bg={cardBg}
          p={8}
          borderRadius="xl"
          boxShadow={cardShadow}
          borderWidth="1px"
          borderColor={borderColor}
        >
          <VStack spacing={6}>
            <Image
              src={Logo}
              alt="GenAlima logo"
              height="auto"
              maxW="2xs"
              alignSelf="center"
            />
            <FormControl id="username" isInvalid={!!errors.username || !!error}>
              <Input
                id="username"
                {...register("username", {
                  required: "Username is required",
                  pattern: emailPattern,
                })}
                placeholder="Email"
                type="email"
                required
                size="lg"
                bg={inputBg}
                borderColor={borderColor}
                color={textColor}
                _placeholder={{ color: placeholderColor }}
                _hover={{ borderColor: "#10a37f" }}
                _focus={{ borderColor: "#10a37f", boxShadow: "0 0 0 1px #10a37f" }}
                isDisabled={loginMutation.isPending}
              />
              {errors.username && (
                <FormErrorMessage>{errors.username.message}</FormErrorMessage>
              )}
            </FormControl>
            <FormControl id="password" isInvalid={!!error}>
              <InputGroup size="lg">
                <Input
                  {...register("password", {
                    required: "Password is required",
                  })}
                  type={show ? "text" : "password"}
                  placeholder="Password"
                  required
                  bg={inputBg}
                  borderColor={borderColor}
                  color={textColor}
                  _placeholder={{ color: placeholderColor }}
                  _hover={{ borderColor: "#10a37f" }}
                  _focus={{ borderColor: "#10a37f", boxShadow: "0 0 0 1px #10a37f" }}
                  isDisabled={loginMutation.isPending}
                />
                <InputRightElement
                  color={placeholderColor}
                  _hover={{
                    cursor: "pointer",
                    color: textColor,
                  }}
                >
                  <Icon
                    as={show ? ViewOffIcon : ViewIcon}
                    onClick={setShow.toggle}
                    aria-label={show ? "Hide password" : "Show password"}
                  />
                </InputRightElement>
              </InputGroup>
              {error && <FormErrorMessage>{error}</FormErrorMessage>}
            </FormControl>
            <Link 
              as={RouterLink} 
              to="/recover-password" 
              color="#10a37f"
              fontSize="sm"
              _hover={{ color: "#0d8265" }}
              alignSelf="flex-start"
            >
              Forgot password?
            </Link>
            <Button 
              type="submit" 
              size="lg"
              width="full"
              bg="#10a37f"
              color="white"
              _hover={{ bg: "#0d8265" }}
              _active={{ bg: "#0a6b4f" }}
              isLoading={loginMutation.isPending}
              loadingText="Signing in..."
              isDisabled={loginMutation.isPending}
            >
              Sign In
            </Button>
            <Text color={textColor} textAlign="center">
              Don't have an account?{" "}
              <Link 
                as={RouterLink} 
                to="/signup" 
                color="#10a37f"
                fontWeight="medium"
                _hover={{ color: "#0d8265" }}
              >
                Sign up
              </Link>
            </Text>
          </VStack>
        </Box>
      </Container>
    </Box>
  )
}
