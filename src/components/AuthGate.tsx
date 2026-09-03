import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { useAuth, type User } from "@/lib/auth";
import { useBootBlocker } from "@/lib/loading";

/**
 * Renders children only for a signed-in user, otherwise redirects to /login.
 */
export function AuthGate({
  children,
}: {
  children: (user: User) => React.ReactNode;
}) {
  const router = useRouter();
  const { isLoading, error, user } = useAuth();

  // Every tab screen renders through here, so this one blocker keeps the boot
  // splash up until auth resolves on whichever page opens first.
  useBootBlocker("auth", isLoading);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    // No spinner — the boot splash is covering the screen at this point.
    return <View className="flex-1 bg-white dark:bg-zinc-950" />;
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6 dark:bg-zinc-950">
        <Text className="text-center text-red-600 dark:text-red-400">
          {error.message}
        </Text>
      </View>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children(user)}</>;
}
