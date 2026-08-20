import { Suspense } from "react";
import ReimpostaPasswordForm from "./ReimpostaPasswordForm";

export default function ReimpostaPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ReimpostaPasswordForm />
    </Suspense>
  );
}
