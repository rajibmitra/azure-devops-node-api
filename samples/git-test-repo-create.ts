import * as common from "./common";
import * as nodeApi from "azure-devops-node-api";

import * as GitApi from "azure-devops-node-api/GitApi";
import * as GitInterfaces from "azure-devops-node-api/interfaces/GitInterfaces";

export async function run() {
    let webApi: nodeApi.WebApi = await common.getWebApi();
    let gitApiObject: GitApi.IGitApi = await webApi.getGitApi();

    common.banner("Git Samples");
    let project = common.getProject();
    console.log("Project:", project);

    common.heading("Get Repositories");
    const repos: GitInterfaces.GitRepository[] = await gitApiObject.getRepositories(project);
    console.log("There are", repos.length, "repositories in this project");

    common.heading("Create a repository");
    const createOptions: GitInterfaces.GitRepositoryCreateOptions = <GitInterfaces.GitRepositoryCreateOptions>{name: "easydevops"};
    let newRepo: GitInterfaces.GitRepository = await gitApiObject.createRepository(createOptions, project);
    console.log("New repo:", newRepo.name);


}
