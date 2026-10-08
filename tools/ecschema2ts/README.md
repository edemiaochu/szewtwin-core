# ecschema2ts

ecschema2ts is a command-line tool that takes an DM3.1/DM3.2 BIS DMSchema xml file and outputs a valid Typescript module that uses szewTwin.js.

## Quick Overview

```sh
npm install -g @szewtwin/ecschema2ts

ecschema2ts -i C:\Path\To\Schema\Domain.dmschema.xml -o C:\Desired\Output\Path\
```

## Getting Started

### Installation

Install globally:

```sh
npm install -g @szewtwin/ecschema2ts
```

### Creating a Typescript module

To create a Typescript file from the an DMSchema, run:

```sh
ecschema2ts -i C:\Path\To\Schema\Domain.dmschema.xml -o C:\Desired\Output\Path\
```

## Updating to new version

Since the package is installed globally, updating has a different syntax than normal. To update the package globally, run:

```sh
npm update -g @szewtwin/ecschema2ts
```

## Known Issues

- The ordering of the Typescript classes may be out of order preventing compilation of the typescript file. A workaround is to reorder the classes by hand.

## Troubleshooting

- Are you have issues converting your DMSchema?
  - Check to make sure your DMSchema version is DM3.1
  - Check if the BIS DMSchema passes validation, [check DMSchema status](https://szewec.sharepoint.com/sites/BIS/Lists/Schema%20Development%20Status/AllItems.aspx?viewpath=%2Fsites%2FBIS%2FLists%2FSchema%20Development%20Status%2FAllItems.aspx).
