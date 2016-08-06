'use strict';

const os = require('os')
const path = require('path')
const fs = require('fs')
const Promise = require('bluebird')
const zlib = require('zlib');
const spawn = require('child_process').spawn

const DEFAULT_CANDIDATE_FILE_PATH = `.extended-dmenu/candidates.json.gz`

function convertToAbsolutePath(path) {
  if (/^\/.*$/.test(path)) {
    // Absolute path
    return path
  } else {
    return `${os.homedir()}/${path}`
  }
}

class ExtendedDmenu {
  constructor(options) {
    // Store the options
    this.options = options

    // Read the candidate file
    this.candidates = new Promise((resolve, reject) => {
      fs.stat(this.getCandidateFilePath(), (err) => {
        if (err) {
          // There is no file
          resolve(new Map())
        } else {
          const input = fs.createReadStream(this.getCandidateFilePath()).pipe(zlib.createGunzip())

          let x = ""
          input.on('data', (chunk) => x += chunk)
          input.on('end', () => {
            resolve(new Map(JSON.parse(x)))
          })
          input.on('error', (err) => resolve(err))
        }
      })
    })
  }
  getCandidateFilePath() {
    if (!this.candidateFilePath) {
      const value = this.options.candidateFilePath || DEFAULT_CANDIDATE_FILE_PATH
      this.candidateFilePath = convertToAbsolutePath(value)
    }
    return this.candidateFilePath
  }
  open() {
    const dmenuArguments = this.options.dmenuArguments || []
    const commandForDirectory = this.options.commandForDirectory
    const commands = this.options.command
    return this.candidates.then((candidates) => {
      return new Promise((resolve, reject) => {
        // Execute dmenu
        const dmenu = spawn("dmenu", dmenuArguments, {
          "stdio":  ['pipe', 'pipe', process.stderr]
        })

        // Sort the candidates
        const cs = []
        for (const key of candidates.keys()) {
          cs.push({
            key: key,
            value: candidates.get(key) || 0
          })
        }

        cs.sort(function (a, b) {
          if (a.value < b.value) return 1
          else if (b.value < a.value) return -1
          else if (a.key.length < b.key.length) return -1
          else if (b.key.length < a.key.length) return 1
          else return 0
        }).forEach((candidate) => {
          dmenu.stdin.write(`${candidate.key}\n`)
        })
        dmenu.stdin.end()

        let x = ''
        dmenu.stdout.on('data', (chunk) => {
          x += chunk
        })
        dmenu.on('close', () => {
          resolve(x.replace('\n', ''))
        })
      }).then((selectedValue) => {
        if (selectedValue === "") {
          return null;
        }
        // Execute/open the return value
        fs.stat(selectedValue, (err, stat) => {
          if (err) {
            spawn(selectedValue, [], {
              stdio: [process.stdin, process.stdout, process.stderr]
            })
          } else {
            if (stat.isDirectory()) {
              // If the selectedValue is a directory
              spawn(commandForDirectory, [selectedValue])
            } else {
              // If not
              for (const command of commands) {
                if (new RegExp(command.target).test(selectedValue)) {
                  spawn(command.command, [selectedValue])
                  break ;
                }
              }
            }
          }
        })

        // Update the value
        if (candidates.has(selectedValue)) {
          candidates.set(selectedValue, (candidates.get(selectedValue) || 0) + 1)
        }

        // Store the candidates
        this.storeCandidates(candidates)
      })
    })
  }
  update() {
    const targets = this.options.target || []
    const findArguments = this.options.findArguments || []
    const home = os.homedir()

    function find(startingPoints, expressions) {
      let x = ""
      const find = spawn("find", findArguments.concat(startingPoints).concat(expressions))
      return new Promise((resolve, reject) => {
        find.stdout.on('data', (chunk) => x += chunk)
        find.on('close', () => resolve(x.split("\n").filter((elem) => { return elem !== "" })))
      })
    }

    const promises = []
    const candidates = new Map()
    // dmenu_path
    promises.push(
      new Promise((resolve, reject) => {
        const dpath = spawn("dmenu_path")
        let x = ""
        dpath.stdout.on('data', (chunk) => x += chunk)
        dpath.on('close', () => resolve(x.split("\n").filter((elem) => { return elem !== "" })))
      }).then((result) => {
        for (const x of result) {
          candidates.set(x, 0)
        }
      })
    )

    for (const target of targets) {
      const path = target.path.map((elem) => { return convertToAbsolutePath(elem) })

      for (const vcs of (target.vcs || [])) {
        switch (vcs) {
          case "git":
            promises.push(
              find(path, ["-name", ".git", "-and", "-type", "d"])
              .then((result) => {
                return result.map((elem) => {
                  return elem.replace(/.git$/, "")
                })
              }).then((result) => {
                for (const x of result) {
                  candidates.set(x, 0)
                }
              }))
            break;
          default:
        }
      }
      for (const directory of (target.directory || [])) {
        if (directory === "") {
          promises.push(
            find(path, ["-type", "d"])
            .then((result) => {
              for (const x of result) {
                candidates.set(x, 0)
              }
            })
          )
        } else {
          promises.push(
            find(path, ["-type", "d", "-and", "-name", directory])
            .then((result) => {
              for (const x of result) {
                candidates.set(x, 0)
              }
            })
          )
        }
      }
      for (const file of (target.file || [])) {
        if (file === "") {
          promises.push(
            find(path, ["-type", "f"])
            .then((result) => {
              for (const x of result) {
                candidates.set(x, 0)
              }
            })
          )
        } else {
          promises.push(
            find(path, ["-name", file])
            .then((result) => {
              for (const x of result) {
                candidates.set(x, 0)
              }
            })
          )
        }
      }
    }

    promises.unshift(this.candidates)
    return Promise.all(promises).then((x) => {
      const previousCandidates = x[0]
      // Store the candidates to the candidate file
      return new Promise((resolve, reject) => {
        for (var key of previousCandidates.keys()) {
          if (previousCandidates.has(key)) {
            candidates.set(key, previousCandidates.get(key))
          }
        }

        this.storeCandidates(candidates)
      })
    })
  }
  storeCandidates(candidates) {
    const content = []
    for (const key of candidates.keys()) {
      content.push([key, candidates.get(key)])
    }
    zlib.gzip(JSON.stringify(content), (err, binary) => {
      if (err) {
        reject(err)
      } else {
        fs.writeFileSync(this.getCandidateFilePath(), binary);
      }
    })
  }
}

exports.ExtendedDmenu = ExtendedDmenu
