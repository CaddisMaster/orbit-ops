---
# A lab (#448), like every Docker module. Clue 1 of Unit 2.2 (docs/story.md) is in lab_done: the lab
# finds it, so it never goes in complete (#422). The setup builds the bay's two fabricator images on
# the learner's own Docker, since no real registry holds them; checks read labels, never IDs. Its build
# files are base64 so the setup doesn't show the clues (this one's date, module 10's author and layer)
# before Docker does. Decoded, they're held to docs/story.md by tests/test_docker.py.
title: Images, tags and digests
minutes: 20
story: |
  **Mission log, day 57.** The fabricator runs whatever image the bay's runbook names:
  `meridian/fabricator:stable`, "the 28 September build". Nobody has checked that since. Okafor
  wants to know what `stable` actually is, not what the runbook says it is.
quiz:
  - type: choice
    q: "The bay pulled `nginx:1.29` in March and pulled it again in June. Nobody on the station built anything. What happened?"
    code: |-
      $ docker images nginx --format "{{.Tag}} {{.ID}}"
      1.29 7f3b1c2a9d40

      $ docker images nginx --format "{{.Tag}} {{.ID}}"
      1.29 c41e88b05a17
    options:
      - "The image was damaged on the station's disk, so Docker gave it a new ID"
      - "Whoever publishes `nginx` moved the `1.29` tag to a new image, and June's pull fetched it"
      - "Docker gives an image a new ID every time it starts a container from it"
      - "`--format` prints a different ID each time it runs, so it can't be compared"
    answer: 1
    explain: >-
      A tag is a name, and the registry's owner can point it at a new image whenever they publish
      one, a patch release for instance. A later pull of the same tag brings the new image. The ID
      changes only when the image does, and starting containers never changes it.
  - type: choice
    q: "Which of these always gets you exactly the same image, today and next year?"
    options:
      - "`alpine`"
      - "`alpine:latest`"
      - "`alpine:3.24`"
      - "`alpine@sha256:` followed by the image's digest"
    answer: 3
    explain: >-
      A digest is worked out from the image's content, so it can't be moved to another image. The
      other three are tags: `alpine` means `alpine:latest`, which moves with every release, and even
      `3.24` moves to each 3.24 patch release.
  - type: choice
    q: "What does `docker tag alpine:3.24 bay/base:approved` do?"
    options:
      - "Adds a second name for the same image: both names show the same image ID"
      - "Copies the image, so `bay/base:approved` is a separate image with its own ID"
      - "Renames the image: `alpine:3.24` no longer exists afterwards"
      - "Uploads the image to a registry called `bay`, under the name `base`"
    answer: 0
    explain: >-
      `docker tag` only adds a name. Nothing is copied or uploaded, so both names show the same ID,
      and removing one name with `docker rmi` leaves the image under the other.
  - type: fill
    q: "Which tag does `docker pull redis` pull?"
    answer: ["latest", "redis:latest"]
    explain: >-
      `latest`. A name with no tag means `latest`, which is only a tag like any other: whatever the
      publisher last pointed it at.
  - type: choice
    q: "An image's `org.opencontainers.image.created` label says `2026-09-28`. What does that tell you?"
    options:
      - "That Docker checked the image was built on 28 September 2026"
      - "That the image can't have been changed since 28 September 2026"
      - "That whoever built it wrote that date: a claim, not a proof"
      - "Nothing: Docker ignores every label it doesn't recognise"
    answer: 2
    explain: >-
      Labels are written by whoever builds the image, and Docker stores them without checking.
      They're a good record, but anyone can write any date. Proving who built an image is a later
      unit's job: signing.
cards:
  - id: tag-is-a-name
    section: "Tags move"
    front: What is an image's tag, and can it change?
    back: "A name that points at an image. Its publisher can move it to a new image at any time, so the same tag can fetch different images."
  - id: digest-pins
    section: "Digests don't"
    front: "How do you name one exact image, so it never changes?"
    back: "By its digest: `NAME@sha256:` and 64 hex characters, worked out from the image's content."
  - id: docker-tag
    section: "Tags move"
    front: "What does `docker tag OLD NEW` do?"
    back: "Adds the name NEW to the image OLD names. Nothing is copied: both names show the same ID."
  - id: repodigests
    section: "Digests don't"
    front: "How do you print the registry digest of an image you pulled?"
    back: "`docker image inspect NAME --format \"{{index .RepoDigests 0}}\"`"
  - id: labels-are-claims
    section: "Labels"
    front: "Who writes an image's labels, and can you trust them?"
    back: "Whoever built the image. Docker doesn't check them, so they're a record, not a proof."
lab:
  from: okafor
  task: |-
    Find out what `meridian/fabricator:stable` really is. On Windows, do all of it in Git Bash
    (module 01), and run `export MSYS_NO_PATHCONV=1` there first (the lesson's *Pulling and listing
    images* says why).

    1. Read a real image's digest, and run it by that digest:
       1. Run `docker pull alpine:3.24`.
       2. Run `docker image inspect alpine:3.24 --format "{{index .RepoDigests 0}}"`. It prints one
          line, `alpine@sha256:` and 64 hex characters.
       3. Copy that whole line into this command in place of `NAME@DIGEST`, and run it:
          `docker run --rm NAME@DIGEST cat /etc/alpine-release`. `/etc/alpine-release` holds Alpine's
          exact version.
       4. Paste what 2 and 3 printed, the digest line and the version, in the first box.
    2. Run the setup below. It rebuilds the bay's two fabricator images on your machine from the build
       files the depot sent, encoded so they arrive intact: `meridian/fabricator:2026-09-28` and
       `meridian/fabricator:stable`. It prints two `sha256:` lines, the new images' full IDs: they
       aren't digests, and they aren't pasted anywhere. On Ubuntu's `docker.io` it also prints a
       `DEPRECATED` warning about the builder: that's fine.
    3. The runbook says `stable` **is** the 2026-09-28 build. Check: run
       `docker images meridian/fabricator --format "{{.Tag}} {{.ID}}"`, and paste what it prints in the
       second box.
    4. Both images were built on your machine just now, so Docker's own record of when they were built
       says today (*Pulling and listing images*). Read when the bay built them, from their labels. Run
       these two, and paste what they print in the third box:
       1. `docker image inspect meridian/fabricator:2026-09-28 --format '{{index .Config.Labels "org.opencontainers.image.created"}}'`
       2. `docker image inspect meridian/fabricator:stable --format '{{index .Config.Labels "org.opencontainers.image.created"}}'`
    5. Okafor wants today's `stable` kept as evidence, whatever happens to the tag next. Give it a
       second name, `meridian/fabricator:evidence`, with `docker tag`. Then run step 3's command again,
       and paste what it prints in the last box.
  setup: |-
    echo 'RlJPTSBhbHBpbmU6My4yNApMQUJFTCBvcmcub3BlbmNvbnRhaW5lcnMuaW1hZ2UudGl0bGU9ImZhYnJpY2F0b3IiIG9yZy5vcGVuY29udGFpbmVycy5pbWFnZS5jcmVhdGVkPSIyMDI2LTA5LTI4VDA3OjEyOjAwWiIgb3JnLm9wZW5jb250YWluZXJzLmltYWdlLmF1dGhvcnM9ImZhYnJpY2F0aW9uIGJheSIKQ01EIFsiZWNobyIsICJmYWJyaWNhdG9yOiByZWFkeSJdCg==' | base64 --decode | docker build -q -t meridian/fabricator:2026-09-28 -
    echo 'RlJPTSBhbHBpbmU6My4yNApMQUJFTCBvcmcub3BlbmNvbnRhaW5lcnMuaW1hZ2UudGl0bGU9ImZhYnJpY2F0b3IiIG9yZy5vcGVuY29udGFpbmVycy5pbWFnZS5jcmVhdGVkPSIyMDI2LTA5LTMwVDAzOjQ3OjAwWiIgb3JnLm9wZW5jb250YWluZXJzLmltYWdlLmF1dGhvcnM9ImRlcG90LXN5bmMiClJVTiBoZWFkIC1jIDQwOTYgL2Rldi91cmFuZG9tID4gL3Vzci9sb2NhbC9iaW4vc3luYy1hZ2VudCAmJiBjaG1vZCA3NTUgL3Vzci9sb2NhbC9iaW4vc3luYy1hZ2VudApDTUQgWyJlY2hvIiwgImZhYnJpY2F0b3I6IHJlYWR5Il0K' | base64 --decode | docker build -q -t meridian/fabricator:stable -
  boxes:
    - prompt: "What the `inspect` and the `run` by digest printed."
      checks:
        - {regex: '^(docker\.io/library/)?alpine@sha256:[0-9a-f]{64}\s*$', says: "alpine:3.24's registry digest", hint: "Is it alpine:3.24 that was inspected, with {{index .RepoDigests 0}}?"}
        - {regex: '^3\.24\.\d+\s*$', says: "The container started by digest is Alpine 3.24", hint: "Was the run given the whole NAME@sha256:… line, and cat /etc/alpine-release?"}
      example: |
        alpine@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf
        3.24.4
    - prompt: "What `docker images meridian/fabricator` printed, before the evidence tag."
      checks:
        - {regex: '^stable (?:sha256:)?[0-9a-f]{12,64}\s*$', says: "The stable tag and its image ID", hint: "Did the setup run, and was --format \"{{.Tag}} {{.ID}}\" given?"}
        - {regex: '^2026-09-28 (?:sha256:)?[0-9a-f]{12,64}\s*$', says: "The 2026-09-28 tag and its image ID"}
        - {not_contains: "evidence", says: "Pasted before the evidence tag was added"}
      example: |
        stable da0084b573e5
        2026-09-28 1a63198d1a17
    - prompt: "When each fabricator image was built, by its label."
      checks:
        - {regex: '^2026-09-28T07:12:00Z\s*$', says: "The 2026-09-28 build's created label"}
        - {regex: '^2026-09-30T03:47:00Z\s*$', says: "stable's created label", hint: "Were both images inspected, with the label's full name inside index?"}
      example: |
        2026-09-28T07:12:00Z
        2026-09-30T03:47:00Z
    - prompt: "What `docker images meridian/fabricator` printed after the evidence tag."
      checks:
        - {regex: '^evidence (?:sha256:)?[0-9a-f]{12,64}\s*$', says: "The evidence tag exists", hint: "Was it docker tag meridian/fabricator:stable meridian/fabricator:evidence?"}
        - {regex: '(?:^evidence (\S+)\s*$[\s\S]*^stable \1\s*$)|(?:^stable (\S+)\s*$[\s\S]*^evidence \2\s*$)', says: "evidence and stable are one image: the same ID", hint: "docker tag adds a name to an image. Which image did evidence get?"}
        - {regex: '^2026-09-28 (?:sha256:)?[0-9a-f]{12,64}\s*$', says: "The 2026-09-28 build is still there"}
      example: |
        evidence da0084b573e5
        stable da0084b573e5
        2026-09-28 1a63198d1a17
comms:
  open:
    - {from: meridian, text: "FABRICATOR · RUNS: meridian/fabricator:stable · RUNBOOK: stable = BUILD 2026-09-28 · DIGEST ON RECORD: NONE"}
    - {from: okafor, text: "The runbook says `stable` is the 28 September build. Nobody's checked that in weeks."}
    - {from: okafor, text: "Don't tell me what it's called. Tell me what it is."}
  lab_done:
    - {from: meridian, text: "FABRICATOR · stable ≠ BUILD 2026-09-28 · stable CREATED 2026-09-30T03:47Z · SECOND NAME: evidence"}
    - {from: okafor, text: "Same name, a different image. And it was built on the thirtieth. The day C-323 came aboard."}
    - {from: okafor, text: "Nobody runs `stable` until we know who built it. The evidence tag stays where it is."}
  complete:
    - {from: okafor, text: "A tag is what someone says an image is. A digest is what it is. We should have written one down."}
---

## Pulling and listing images

**A registry is a server that stores images for others to pull. Docker Hub is the default one.** **A
repository is an image's name without its tag**, `alpine` or `meridian/fabricator`: every tag of it
lives there (nothing to do with a git repository). So a full name has **the registry it lives in, the
repository, and a tag**: `ghcr.io/caddismaster/orbit-ops:0.14.0` is this course's image on GitHub's
registry, in its owner `caddismaster`'s space. **The first part is a registry only if it looks like a
server's name, with a dot; with no registry, Docker assumes Docker Hub**, so `meridian/fabricator`
would be pushed to Docker Hub, and `alpine:3.24` is short for `docker.io/library/alpine:3.24`, `library/` being where
Docker Hub keeps its official images.

**`docker pull NAME` downloads an image without running anything.** **`docker images` lists the images
on your machine, and `docker images NAME` only that repository's.** Each has an **image ID**, 12
hexadecimal characters (the digits 0–9 and the letters a–f) that name it on your machine. **Different
IDs mean different images. An ID changes only when the image's content does: starting containers
never changes it.** **Docker also records when each image was built, and building it again resets
that time** (`{{.CreatedAt}}` with `--format`). The table looks different from one Docker version to
the next, so pick its columns with `--format`, as with `docker ps` in module 01:

```text
$ docker images alpine --format "{{.Tag}} {{.ID}}"
3.24 f59abe656b69
3.23 469c9ea410b9
```

**On Windows, Git Bash rewrites any argument that starts with `/` into a Windows path before Docker
sees it**, so `cat /etc/alpine-release` would look for `C:/Program Files/Git/etc/alpine-release`.
**`export MSYS_NO_PATHCONV=1` turns that off** for the rest of that Git Bash window.

## Tags move

**A tag is a name that points at an image, and nothing more.** **`docker tag EXISTING NEW` gives an
image a second name**: nothing is copied, so **both names show the same ID**. **`docker tag` prints
nothing when it works**: list the images to see the new name. **`docker rmi NAME` removes a name**,
printing `Untagged:`, and the image itself goes when its last name does.

**Whoever publishes an image can move its tag to a new image at any time.** `alpine:3.24` is 3.24.4
today. When a patch release, 3.24.5, comes out with fixes, the same tag points at it, and your next
pull of `alpine:3.24` fetches a different image. **A name with no tag means `latest`**, which moves
with every release. So **a tag can't tell you which image you got**: the same name can fetch different
images on different days.

## Digests don't

**A digest is a fingerprint worked out from an image's content: `sha256:` and 64 hex characters.**
Change one byte of the image and the digest changes, so **a digest can never point at a different
image.** A registry knows every image by its digest, and `docker pull` prints it as `Digest:`. **Only
the digest is the same on every machine**: an image ID is your Docker's own name for the image, and
depending on how your Docker stores images it may or may not start the same way.

**`docker image inspect NAME` prints everything Docker knows about an image**, as JSON. **`--format
"{{index .RepoDigests 0}}"` prints just its registry digest, as `NAME@sha256:…`.** `.RepoDigests` is a
list, one entry per registry the image came from, and `index … 0` takes the first, like `codes[0]` in
Python. An image you built yourself may have no registry digest, and then `index` fails.

```text
$ docker image inspect alpine:3.23 --format "{{index .RepoDigests 0}}"
alpine@sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2
```

**Put that after `docker pull` or `docker run` in place of `NAME:TAG`, and you get exactly that image,
today or in a year.** Official images are built for several kinds of machine, `linux/amd64` for most
PCs and servers and `linux/arm64` for Apple-silicon Macs, and their digest names the whole set, so
**one pinned digest works on a Mac and on a server alike.**

| Name | Can it fetch a different image tomorrow? |
|---|---|
| `alpine` (`latest`) | yes, with every release |
| `alpine:3.24` | yes, with each 3.24 patch |
| `alpine@sha256:f59a…` | never |

## Labels

**An image can carry labels: notes written by whoever built it**, such as
`org.opencontainers.image.created`, the build date, by a naming standard most builders follow. Its
dates look like `2026-11-17T09:00:00Z`: `T` separates the date from the time, and `Z` means UTC.
**`--format '{{index .Config.Labels "LABEL"}}'` prints one**, with the label's full name in place of
`LABEL`. The single quotes keep the double quotes inside them for Docker. **Docker never checks a
label, so a label is a claim, not a proof**: proving who built an image is a later unit's job.

**On the real station:** this course's `Dockerfile` starts `FROM python:3.14.10-slim@sha256:3cab…`,
and `docker-compose.yml` runs `postgres:16.15@sha256:9e2c…`. The tag is for people to read; the digest
decides. `tests/test_repo_hardening.py` fails any change that drops either digest.

## Try it

```bash
docker pull alpine:3.24
docker images alpine --format "{{.Tag}} {{.ID}}"
docker image inspect alpine:3.24 --format "{{index .RepoDigests 0}}"
docker image inspect alpine:3.24 --format "{{.Os}}/{{.Architecture}}"
docker tag alpine:3.24 my-alpine:pinned
docker images my-alpine --format "{{.Tag}} {{.ID}}"
docker rmi my-alpine:pinned
```

The pull ends with the image's `Digest:`, the same one `inspect` prints. `{{.Os}}/{{.Architecture}}`
says which machine's version you got. `docker tag` prints nothing, then `my-alpine:pinned` shows the
same ID as `alpine:3.24`, and `docker rmi` prints `Untagged: my-alpine:pinned`, leaving `alpine:3.24`
where it was.
