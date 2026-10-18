'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { ClockCounterClockwise, SignOut } from '@phosphor-icons/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/shadcn/utils';

/**
 * Header account control.
 *  - loading  → nothing (avoids a flash)
 *  - signed out → compact "Sign in" button
 *  - signed in  → avatar that opens a dropdown (name/email, History, Sign out)
 */
export function UserMenu() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div className="h-8 w-8" aria-hidden />;
  }

  if (!session?.user) {
    return (
      <Button variant="outline" size="sm" onClick={() => signIn('google')} className="rounded-full">
        Sign in
      </Button>
    );
  }

  const { name, email, image } = session.user;
  const initial = (name ?? email ?? '?').charAt(0).toUpperCase();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2"
        >
          <Avatar image={image} initial={initial} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className={cn(
            'border-border bg-popover text-popover-foreground z-50 min-w-56 rounded-xl border p-1 shadow-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        >
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Avatar image={image} initial={initial} />
            <div className="min-w-0">
              {name && <p className="text-foreground truncate text-sm font-medium">{name}</p>}
              {email && <p className="text-muted-foreground truncate text-xs">{email}</p>}
            </div>
          </div>

          <DropdownMenu.Separator className="bg-border my-1 h-px" />

          <DropdownMenu.Item asChild>
            <Link
              href="/history"
              className="hover:bg-muted focus:bg-muted flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none"
            >
              <ClockCounterClockwise className="h-4 w-4" weight="bold" />
              Interview history
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onSelect={() => signOut()}
            className="hover:bg-muted focus:bg-muted text-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none"
          >
            <SignOut className="h-4 w-4" weight="bold" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Avatar({ image, initial }: { image?: string | null; initial: string }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        className="border-border h-8 w-8 rounded-full border object-cover"
      />
    );
  }
  return (
    <span className="bg-primary/15 text-primary border-border flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold">
      {initial}
    </span>
  );
}
