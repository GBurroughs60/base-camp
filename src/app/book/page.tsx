import Image from "next/image";
import { listBookableArtists } from "@/app/actions/offerIntake";
import BookForm from "./BookForm";

// Public, unauthenticated page -- the shared offer-intake form for anyone
// outside Ridge (a venue, promoter, or private buyer) submitting a new
// booking offer. One shared URL with an artist dropdown rather than a
// per-artist link, per the earlier scoping decision. Exempt from the login
// redirect in middleware.ts, same pattern as /approve/[token].
export default async function BookPage() {
  const artists = await listBookableArtists();

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12 bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center text-center mb-8">
          <Image
            src="/brand/ridge-dark-lockup.png"
            alt="The Ridge Music Group"
            width={112}
            height={112}
            className="mb-4 dark:hidden"
            priority
          />
          <Image
            src="/brand/ridge-light-lockup.png"
            alt="The Ridge Music Group"
            width={112}
            height={112}
            className="mb-4 hidden dark:block"
            priority
          />
          <h1 className="font-display text-2xl font-medium tracking-tight">Submit an Offer</h1>
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">
            Tell us about the show and we&apos;ll get back to you.
          </p>
        </div>

        <BookForm artists={artists} />
      </div>
    </div>
  );
}
