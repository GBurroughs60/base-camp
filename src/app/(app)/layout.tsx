import Nav from "@/components/Nav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <Nav />
      <div className="flex-1 min-w-0">
        <main className="max-w-6xl w-full mx-auto px-6 py-8 sm:px-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
