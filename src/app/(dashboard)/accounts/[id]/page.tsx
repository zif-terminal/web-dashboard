import Link from "next/link";
import { AccountDetail } from "@/components/account-detail";
import { Button } from "@/components/ui/button";

interface AccountPageProps {
  params: Promise<{ id: string }>;
}

export default async function AccountPage({ params }: AccountPageProps) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" asChild>
          <Link href="/accounts">Back</Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Account Details</h1>
          <p className="text-muted-foreground">
            View and manage this exchange account
          </p>
        </div>
      </div>
      <AccountDetail accountId={id} />
    </div>
  );
}
