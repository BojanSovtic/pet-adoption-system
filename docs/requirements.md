# Requirements

What the Pet Adoption System does, from a user's point of view. This describes the current implementation (checked against the code on 2026-10-21). For how it is built, see [architecture.md](architecture.md); for status and the roadmap, see [progress.md](progress.md).

## Purpose

People post pets that need a new home. Other people browse those pets and apply to adopt one. The person who posted the pet reviews the applications and accepts one.

## User roles

There are no separate account types or admin users. A person's role depends on the situation:

- **Visitor** (not signed in): can browse and search pets and view pet details.
- **Signed-in user:** can post pets and apply to adopt pets posted by others.
- **Pet owner:** the signed-in user who posted a pet. Only they can edit or delete it and review its applications.
- **Applicant:** a signed-in user who applied for a pet. Only they can withdraw their application.

The same user can be an owner of some pets and an applicant for others.

## Accounts and sign-in

- Users register with a name, an email address and a password (8–128 characters).
- Each email address can be registered only once. Email addresses are not case-sensitive.
- Registering signs the user in straight away.
- Users sign in with email and password and stay signed in for 7 days, or until they sign out.
- Repeated sign-in attempts are slowed down: too many attempts in a short time are temporarily refused.
- Pages that need an account (posting a pet, editing a pet, the applications page) send visitors to the sign-in page and return them afterwards.

## Browsing and searching pets

- Anyone can see the list of pets and each pet's details, without an account.
- Each pet has a name, species (dog, cat or other), age in years, a description, an optional photo and an adoption status.
- The list can be:
  - searched by pet name,
  - filtered by species and by status,
  - sorted by newest, oldest, name or age,
  - paged, 12 pets per page.
- The current search, filters and page are part of the page address, so the Back button and shared links keep them.

## Posting and managing pets

- Any signed-in user can post a pet. They become its owner.
- Only the owner can edit a pet's details or delete it. Other users do not see the Edit and Delete buttons, and the server refuses such changes anyway.
- The owner can add, replace or remove one photo per pet (JPEG, PNG or WebP, up to 5 MB).
- Users cannot set a pet's adoption status by hand; it changes automatically with its applications (see below).
- A pet cannot be deleted while it has a pending or accepted application. Deleting a pet also deletes its rejected and withdrawn applications.

## Adoption applications

### Applying

- A signed-in user applies from the pet's detail page with a short message (up to 2,000 characters).
- Users cannot apply for their own pet or for a pet that is already adopted.
- A user can have only one active application per pet. After a rejection they cannot apply again for that pet; after withdrawing, they can.

### Reviewing and deciding

- The **Applications** page shows two lists:
  - **Applications for my pets:** the owner sees each applicant's name, email and message, and can accept or reject pending applications.
  - **My applications:** the applicant sees the status of each application and can withdraw pending ones.
- Only the pet owner can accept or reject. Only the applicant can withdraw.
- Applications are private: only the applicant and the pet owner can see an application.
- Owners see applicants' email addresses so they can get in touch. The applicant does not see the owner's details.

### Application statuses

| Status    | Meaning                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| Pending   | Waiting for the owner's decision.                                                   |
| Accepted  | The owner chose this applicant. Final.                                              |
| Rejected  | The owner declined it, or another application for the same pet was accepted. Final. |
| Withdrawn | The applicant cancelled it. Final.                                                  |

- Only pending applications can change. Accepted, rejected and withdrawn applications are final.
- Accepting one application automatically rejects all other pending applications for that pet.

### Pet adoption status

| Status    | When                                                |
| --------- | --------------------------------------------------- |
| Available | No pending applications. New pets start here.       |
| Pending   | At least one application is waiting for a decision. |
| Adopted   | An application was accepted. Final.                 |

- A pet goes back to **Available** when its last pending application is rejected or withdrawn.
- Only one application can ever be accepted for a pet, even if two decisions happen at the same moment.

## Other behavior

- The interface is in English. Serbian translations exist, but there is no way to switch language in the app yet.
- The server sends error codes, not text; the app turns them into translated messages.

## Known limitations

Not supported today:

- No admin or moderator role; nobody can manage other users' pets or accounts.
- No email verification, password reset, account editing or account deletion.
- No sign-in with Google, GitHub or other providers (planned).
- No language switcher (Serbian translations are present but unused).
- No messaging between owners and applicants; contact happens outside the app using the applicant's email.
- An accepted adoption cannot be undone, and a rejected applicant cannot reapply for the same pet.
- The application lists are not paginated or searchable.
- Search covers pet names only; there are no breed, location or size fields.
- Uploaded photos keep their original metadata (for example camera location data).
- Pets created before ownership was introduced have no owner: they are visible, but nobody can edit, delete or apply for them.
- There is no demo or seed data; a fresh installation starts empty.

## Planned

From the roadmap in [progress.md](progress.md); not implemented:

- Pagination for the application lists.
- Sign-in with Google or GitHub (OAuth/OIDC).
- Cloud deployment.
