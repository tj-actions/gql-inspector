/*
Copyright (c) 2018 Kamil Kisiela

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
*/

/* eslint-disable no-console */
import {
  CheckConclusion,
  createSummary,
  diff,
  printSchemaFromEndpoint,
  produceSchema
} from '@graphql-inspector/github'
import {Source} from 'graphql'
import {readFileSync} from 'fs'
import {resolve} from 'path'
import {execSync} from 'child_process'

import * as core from '@actions/core'
import * as github from '@actions/github'
import {batch, castToBoolean} from './utils'
import {WebhookPayload} from '@actions/github/lib/interfaces'

type OctokitInstance = ReturnType<typeof github.getOctokit>
const CHECK_NAME = 'GraphQL Inspector'

function getCurrentCommitSha(): string {
  const sha = execSync(`git rev-parse HEAD`).toString().trim()

  try {
    const msg = execSync(`git show ${sha} -s --format=%s`).toString().trim()
    const PR_MSG = /Merge (\w+) into \w+/i

    if (PR_MSG.test(msg)) {
      const result = PR_MSG.exec(msg)

      if (result) {
        return result[1]
      }
    }
  } catch (e) {
    //
  }

  return sha
}

export async function run(): Promise<void> {
  core.info(`GraphQL Inspector started`)

  // env
  let ref = process.env.GITHUB_SHA
  const commitSha = getCurrentCommitSha()

  core.info(`Ref: ${ref}`)
  core.info(`Commit SHA: ${commitSha}`)

  const token = core.getInput('github-token', {required: true})
  const checkName = core.getInput('name') || CHECK_NAME

  let workspace = process.env.GITHUB_WORKSPACE

  if (!workspace) {
    return core.setFailed(
      'Failed to resolve workspace directory. GITHUB_WORKSPACE is missing'
    )
  }

  const useExperimentalMerge = castToBoolean(
    core.getInput('experimental_merge'),
    false
  )
  const useAnnotations = castToBoolean(core.getInput('annotations'))
  const failOnBreaking = castToBoolean(core.getInput('fail-on-breaking'))
  const endpoint: string = core.getInput('endpoint')
  const approveLabel: string =
    core.getInput('approve-label') || 'approved-breaking-change'

  const octokit = github.getOctokit(token)

  // repo
  const {owner, repo} = github.context.repo

  core.info(`Creating a check named "${checkName}"`)

  const check = await octokit.rest.checks.create({
    owner,
    repo,
    name: checkName,
    head_sha: commitSha,
    status: 'in_progress'
  })

  const checkId = check.data.id

  core.info(`Check ID: ${checkId}`)

  const schemaPointer = core.getInput('schema', {required: true})

  const loadFile = fileLoader({
    octokit,
    owner,
    repo
  })

  if (!schemaPointer) {
    core.error('No `schema` variable')
    return core.setFailed('Failed to find `schema` variable')
  }

  let [schemaRef, schemaPath] = schemaPointer.split(':')

  if (useExperimentalMerge && github.context.payload.pull_request) {
    ref = `refs/pull/${github.context.payload.pull_request.number}/merge`
    workspace = undefined
    core.info(`EXPERIMENTAL - Using Pull Request ${ref}`)

    const baseRef = github.context.payload.pull_request?.base?.ref

    if (baseRef) {
      schemaRef = baseRef
      core.info(`EXPERIMENTAL - Using ${baseRef} as base schema ref`)
    }
  }

  if (endpoint) {
    schemaPath = schemaPointer
  }

  const [oldFile, newFile] = await Promise.all([
    endpoint
      ? printSchemaFromEndpoint(endpoint)
      : loadFile({
          ref: schemaRef,
          path: schemaPath
        }),
    loadFile({
      path: schemaPath,
      ref,
      workspace
    })
  ])

  core.info('Got both sources')

  const sources = {
    old: new Source(oldFile, endpoint || `${schemaRef}:${schemaPath}`),
    new: new Source(newFile, schemaPath)
  }

  const schemas = {
    old: produceSchema(sources.old),
    new: produceSchema(sources.new)
  }

  core.info(`Built both schemas`)

  core.info(`Start comparing schemas`)

  const action = await diff({
    path: schemaPath,
    schemas,
    sources
  })

  let conclusion = action.conclusion
  let annotations = action.annotations || []
  const changes = action.changes || []

  core.setOutput('changes', `${changes.length || 0}`)
  core.info(`Changes: ${changes.length || 0}`)

  const hasApprovedBreakingChangeLabel = github.context.payload.pull_request
    ? github.context.payload.pull_request.labels?.some(
        (label: {name: string}) => label.name === approveLabel
      )
    : false

  // Force Success when failOnBreaking is disabled
  if (
    (!failOnBreaking || hasApprovedBreakingChangeLabel) &&
    conclusion === CheckConclusion.Failure
  ) {
    core.info('FailOnBreaking disabled. Forcing SUCCESS')
    conclusion = CheckConclusion.Success
  }

  if (!useAnnotations) {
    core.info(`Annotations are disabled. Skipping annotations...`)
    annotations = []
  }

  const summary = createSummary(changes, 100, false)

  let title =
    conclusion === CheckConclusion.Failure
      ? 'Something is wrong with your schema'
      : 'Everything looks good'

  core.info(`Conclusion: ${conclusion}`)

  try {
    return await updateCheckRun(octokit, checkId, {
      conclusion,
      output: {title, summary, annotations}
    })
  } catch (e) {
    // Error
    core.error(e.message || e)

    title = 'Invalid config. Failed to add annotation'

    await updateCheckRun(octokit, checkId, {
      conclusion: CheckConclusion.Failure,
      output: {title, summary: title, annotations: []}
    })

    return core.setFailed(title)
  }
}

function fileLoader({
  octokit,
  owner,
  repo
}: {
  octokit: OctokitInstance
  owner: string
  repo: string
}): CallableFunction {
  const query = /* GraphQL */ `
    query GetFile($repo: String!, $owner: String!, $expression: String!) {
      repository(name: $repo, owner: $owner) {
        object(expression: $expression) {
          ... on Blob {
            text
          }
        }
      }
    }
  `

  return async function loadFile(file: {
    ref: string
    path: string
    workspace?: string
  }): Promise<string> {
    if (file.workspace) {
      return readFileSync(resolve(file.workspace, file.path), {
        encoding: 'utf-8'
      })
    }

    const result: WebhookPayload = await octokit.graphql(query, {
      repo,
      owner,
      expression: `${file.ref}:${file.path}`
    })
    core.info(`Query ${file.ref}:${file.path} from ${owner}/${repo}`)

    if (result?.repository?.object?.text) {
      return result.repository.object.text
    } else {
      console.log(result)
      console.error('result.repository.object.text is null')
      throw new Error(`Failed to load '${file.path}' (ref: ${file.ref})`)
    }
  }
}

type UpdateCheckRunOptions = Required<
  Pick<
    NonNullable<Parameters<OctokitInstance['rest']['checks']['update']>[0]>,
    'conclusion' | 'output'
  >
>

async function updateCheckRun(
  octokit: OctokitInstance,
  checkId: number,
  {conclusion, output}: UpdateCheckRunOptions
): Promise<void> {
  core.info(`Updating check: ${checkId}`)

  const {title, summary, annotations = []} = output
  const batches = batch(annotations, 50)

  core.info(`annotations to be sent: ${annotations.length}`)

  await octokit.rest.checks.update({
    check_run_id: checkId,
    completed_at: new Date().toISOString(),
    status: 'completed',
    ...github.context.repo,
    conclusion,
    output: {
      title,
      summary
    }
  })

  try {
    await Promise.all(
      batches.map(async chunk => {
        await octokit.rest.checks.update({
          check_run_id: checkId,
          ...github.context.repo,
          output: {
            title,
            summary,
            annotations: chunk
          }
        })
        core.info(`annotations sent (${chunk.length})`)
      })
    )
  } catch (error) {
    core.error(`failed to send annotations: ${error}`)
    throw error
  }

  // Fail
  if (conclusion === CheckConclusion.Failure) {
    return core.setFailed(output.title)
  }

  // Success or Neutral
}

run()
