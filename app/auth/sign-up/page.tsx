/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { SignUpForm } from "@/components/sign-up-form";
import { ModeToggle } from "@/components/mode-toggle";
import { safeRedirect } from "@/lib/safe-redirect";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeRedirect((await searchParams).next);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <SignUpForm next={next} />
      <ModeToggle />
    </div>
  );
}
