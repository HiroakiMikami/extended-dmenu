# extended-dmenu
## Features
* Flexible configuration
* Open the directory or file using `dmenu`.
`

## Usage
### 1. Write your configuration file
The default file path is `${HOME}/.extended-dmenurc`. The configuration file is written in JSON format.
Following is the example of the config file.

```
{
  "candidatesFile": ".extended-dmenu/candidates.json.gz", // The file path of the candidates
  "dmenuArguments": ["-b", "-i"],                         // The command line arguments for dmenu
  "findArguments": ["-L"],                                // The command line arguments for find
  "target": [
    {
      "path": [""],                                       // Search the entire file system if the path is empty
      "vcs": ["git"]                                      // Search for Git repository
    },
    {
      "path": ["Documents/"],                             // Search from ${HOME}/Documents
      "directory": [""],                                  // Add all directories to the candidates
      "file": ["*.pdf"]                                   // Add pdf files to the candidates
    }
  ],
  "command": [
    { "target": "\\.pdf$", "command": "evince" }          // Use evince if the selected target is pdf
  ],
  "commandForDirectory": "thunar"                         // Use thunar if the seleted target is directory
}
```

`commandForDirectory` is required, and other configurations are optional.

### 2. Create the candidates
To update/create the candidates, run:
```bash
$ extended-dmenu update
```

### 2. Run `extended-dmenu`
Run:
```bash
$ extended-dmenu open
```
