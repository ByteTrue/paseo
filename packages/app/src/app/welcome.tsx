import { useLocalSearchParams } from "expo-router";
import { useEarliestOnlineHostServerId } from "@/app/_layout";
import { WelcomeScreen } from "@/components/welcome-screen";

export default function WelcomeRoute() {
  const params = useLocalSearchParams<{ startupRecovery?: string | string[] }>();
  const anyOnlineHostServerId = useEarliestOnlineHostServerId();
  const startupRecoveryParam = Array.isArray(params.startupRecovery)
    ? params.startupRecovery[0]
    : params.startupRecovery;
  const startupRecoveryHostServerId = startupRecoveryParam === "1" ? anyOnlineHostServerId : null;

  return <WelcomeScreen startupRecoveryHostServerId={startupRecoveryHostServerId} />;
}
